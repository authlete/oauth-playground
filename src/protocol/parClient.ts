// Pushed Authorization Request (RFC 9126).
//
// The client POSTs the full /authorize params to /par with client
// authentication, gets back a `request_uri` (short-lived URN) + expires_in.
// Authorize then navigates to /authorize?client_id=X&request_uri=Y instead of
// the full URL.

import { applyClientAuth } from "./clientAuth";
import { send } from "./dpopHttp";
import type { DpopContext } from "./dpop";
import { buildAuthorizeParams, buildJarParams } from "./authorizeUrl";
import type {
  AuthRequestState,
  ClientConfigState,
  NetworkEntry,
  OidcMetadata,
} from "../types";

export type PushParResult =
  | { ok: true; requestUri: string; expiresIn: number; raw: unknown }
  | {
      ok: false;
      message: string;
      status?: number;
      body?: string;
    };

export interface PushParInput {
  metadata: OidcMetadata;
  client: ClientConfigState;
  authRequest: AuthRequestState;
  /** The signed request object, when JAR is enabled. Signed by the caller (the
   *  store is the single signer) so the pushed object matches what Auth request shows. */
  requestObjectJwt?: string;
  /** When set, a DPoP proof binds the eventual token's key to this request
   *  (the AS records dpop_jkt). FAPI 2.0 pushes the binding to PAR time. */
  dpop?: DpopContext;
  onDpopNonce?: (nonce: string) => void;
  onStart: (entry: NetworkEntry) => void;
  onFinish: (id: string, patch: Partial<NetworkEntry>) => void;
}

export async function pushPar(input: PushParInput): Promise<PushParResult> {
  const parEndpoint = input.metadata.pushed_authorization_request_endpoint;
  if (typeof parEndpoint !== "string") {
    return {
      ok: false,
      message:
        "This AS does not advertise a pushed_authorization_request_endpoint.",
    };
  }

  // JAR: push the params as a signed request object instead of individually.
  let body: URLSearchParams;
  if (input.authRequest.jarEnabled) {
    if (!input.requestObjectJwt) {
      return {
        ok: false,
        message: "No signed request object — set a valid JWK in Client config.",
      };
    }
    body = buildJarParams(
      input.client,
      input.authRequest,
      input.requestObjectJwt,
    );
  } else {
    body = buildAuthorizeParams(input.client, input.authRequest);
  }
  const headers = new Headers({
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  });

  const auth = await applyClientAuth({
    client: input.client,
    audience: parEndpoint,
    headers,
    body,
  });
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

  const sent = await send({
    method: "POST",
    url: parEndpoint,
    headers,
    body: body.toString(),
    dpop: input.dpop
      ? { ctx: input.dpop, onNonce: input.onDpopNonce }
      : undefined,
    onStart: input.onStart,
    onFinish: input.onFinish,
    networkErrorMessage: (err) =>
      err instanceof TypeError
        ? "CORS / network error reaching /par. Enable CORS on the AS for this origin."
        : err instanceof Error
          ? err.message
          : String(err),
  });
  if (!sent.ok) return { ok: false, message: sent.message };
  const { response, bodyText: responseBody } = sent;

  if (!response.ok) {
    return {
      ok: false,
      message: `AS returned ${response.status} from /par.`,
      status: response.status,
      body: responseBody,
    };
  }

  let parsed: { request_uri?: unknown; expires_in?: unknown };
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    return {
      ok: false,
      message: "/par response was not JSON.",
      status: response.status,
      body: responseBody,
    };
  }

  if (typeof parsed.request_uri !== "string") {
    return {
      ok: false,
      message: "/par response is missing `request_uri`.",
      status: response.status,
      body: responseBody,
    };
  }
  const expiresIn =
    typeof parsed.expires_in === "number" ? parsed.expires_in : 90;
  return {
    ok: true,
    requestUri: parsed.request_uri,
    expiresIn,
    raw: parsed,
  };
}
