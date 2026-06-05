// Step 4: Pushed Authorization Request (RFC 9126).
//
// The client POSTs the full /authorize params to /par with client
// authentication, gets back a `request_uri` (short-lived URN) + expires_in.
// Step 5 then navigates to /authorize?client_id=X&request_uri=Y instead of
// the full URL.

import { applyClientAuth } from "./clientAuth";
import { buildAuthorizeParams } from "./authorizeUrl";
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

  const body = buildAuthorizeParams(input.client, input.authRequest);
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

  const id = crypto.randomUUID();
  const startedAt = performance.now();
  input.onStart({
    id,
    startedAt,
    method: "POST",
    url: parEndpoint,
    requestHeaders: Object.fromEntries(headers.entries()),
    requestBody: body.toString(),
  });

  let response: Response;
  try {
    response = await fetch(parEndpoint, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers,
      body: body.toString(),
    });
  } catch (err) {
    const finishedAt = performance.now();
    const message =
      err instanceof TypeError
        ? "CORS / network error reaching /par. Enable CORS on the AS or wait for the v0.2 relay."
        : err instanceof Error
          ? err.message
          : String(err);
    input.onFinish(id, {
      finishedAt,
      durationMs: Math.round(finishedAt - startedAt),
      errorMessage: message,
    });
    return { ok: false, message };
  }

  const responseBody = await response.text();
  const finishedAt = performance.now();
  const respHeaders: Record<string, string> = {};
  response.headers.forEach((v, k) => {
    respHeaders[k] = v;
  });
  input.onFinish(id, {
    finishedAt,
    durationMs: Math.round(finishedAt - startedAt),
    status: response.status,
    statusText: response.statusText,
    responseHeaders: respHeaders,
    responseBody,
  });

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
