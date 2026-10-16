// CIBA backchannel authentication request. Poll mode only — ping/push need a
// client notification endpoint a browser can't host.

import { applyClientAuth } from "./clientAuth";
import { authorizationDetailsWireValue } from "./authorizationDetails";
import type {
  AuthRequestState,
  CibaState,
  ClientConfigState,
  NetworkEntry,
  OidcMetadata,
} from "../types";

export type StartBackchannelResult =
  | {
      ok: true;
      authReqId: string;
      expiresIn: number;
      interval: number;
      raw: unknown;
    }
  | { ok: false; message: string; status?: number; body?: string };

export interface StartBackchannelInput {
  metadata: OidcMetadata;
  client: ClientConfigState;
  authRequest: AuthRequestState;
  ciba: CibaState;
  onStart: (entry: NetworkEntry) => void;
  onFinish: (id: string, patch: Partial<NetworkEntry>) => void;
}

/** Request body without client auth — the caller applies that (real at send
 * time, placeholders in the preview), so it's shared with requestPreview. */
export function buildBackchannelParams(
  authRequest: AuthRequestState,
  ciba: CibaState,
): URLSearchParams {
  const body = new URLSearchParams();
  body.set("scope", authRequest.scopes.join(" "));
  // login_hint is the identity selector — required, unlike in the redirect flow.
  if (authRequest.loginHint.trim())
    body.set("login_hint", authRequest.loginHint.trim());
  if (ciba.bindingMessage.trim())
    body.set("binding_message", ciba.bindingMessage.trim());
  if (ciba.requestedExpiry.trim())
    body.set("requested_expiry", ciba.requestedExpiry.trim());
  if (authRequest.resource.trim())
    body.set("resource", authRequest.resource.trim());
  if (
    authRequest.authorizationDetailsEnabled &&
    authRequest.authorizationDetails.trim()
  ) {
    body.set(
      "authorization_details",
      authorizationDetailsWireValue(authRequest.authorizationDetails),
    );
  }
  return body;
}

export async function startBackchannelAuth(
  input: StartBackchannelInput,
): Promise<StartBackchannelResult> {
  const endpoint = input.metadata.backchannel_authentication_endpoint;
  if (typeof endpoint !== "string") {
    return {
      ok: false,
      message:
        "This AS does not advertise a backchannel_authentication_endpoint.",
    };
  }

  const body = buildBackchannelParams(input.authRequest, input.ciba);
  const headers = new Headers({
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  });

  // CIBA requires a confidential client; a public ("none") one can't initiate.
  const auth = await applyClientAuth({
    client: input.client,
    audience: endpoint,
    headers,
    body,
  });
  if (!auth.ok) return { ok: false, message: auth.message };

  const id = crypto.randomUUID();
  const startedAt = performance.now();
  input.onStart({
    id,
    startedAt,
    method: "POST",
    url: endpoint,
    requestHeaders: Object.fromEntries(headers.entries()),
    requestBody: body.toString(),
  });

  let response: Response;
  try {
    response = await fetch(endpoint, {
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
        ? "CORS / network error reaching the backchannel endpoint. Enable CORS on the AS for this origin."
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
      message: `AS returned ${response.status} from the backchannel endpoint.`,
      status: response.status,
      body: responseBody,
    };
  }

  let parsed: {
    auth_req_id?: unknown;
    expires_in?: unknown;
    interval?: unknown;
  };
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    return {
      ok: false,
      message: "Backchannel response was not JSON.",
      status: response.status,
      body: responseBody,
    };
  }

  if (typeof parsed.auth_req_id !== "string") {
    return {
      ok: false,
      message: "Backchannel response is missing `auth_req_id`.",
      status: response.status,
      body: responseBody,
    };
  }

  return {
    ok: true,
    authReqId: parsed.auth_req_id,
    expiresIn: typeof parsed.expires_in === "number" ? parsed.expires_in : 600,
    interval: typeof parsed.interval === "number" ? parsed.interval : 5,
    raw: parsed,
  };
}
