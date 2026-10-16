// Device authorization request (RFC 8628 §3.1). The consumption device POSTs
// client auth + scope and gets back a device_code / user_code pair to show the
// user, plus the verification URI they visit on a second device.

import { applyClientAuth } from "./clientAuth";
import { authorizationDetailsWireValue } from "./authorizationDetails";
import type {
  AuthRequestState,
  ClientConfigState,
  NetworkEntry,
  OidcMetadata,
} from "../types";

export type StartDeviceResult =
  | {
      ok: true;
      deviceCode: string;
      userCode: string;
      verificationUri: string;
      verificationUriComplete?: string;
      expiresIn: number;
      interval: number;
      raw: unknown;
    }
  | { ok: false; message: string; status?: number; body?: string };

export interface StartDeviceInput {
  metadata: OidcMetadata;
  client: ClientConfigState;
  authRequest: AuthRequestState;
  onStart: (entry: NetworkEntry) => void;
  onFinish: (id: string, patch: Partial<NetworkEntry>) => void;
}

/** Request body without client auth — the caller applies that (real at send
 * time, placeholders in the preview), so it's shared with requestPreview. */
export function buildDeviceParams(
  authRequest: AuthRequestState,
): URLSearchParams {
  const body = new URLSearchParams();
  // scope is the whole ask here — there's no login_hint; the user is identified
  // when they authenticate at the verification URI.
  if (authRequest.scopes.length)
    body.set("scope", authRequest.scopes.join(" "));
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

export async function startDeviceAuthorization(
  input: StartDeviceInput,
): Promise<StartDeviceResult> {
  const endpoint = input.metadata.device_authorization_endpoint;
  if (typeof endpoint !== "string") {
    return {
      ok: false,
      message: "This AS does not advertise a device_authorization_endpoint.",
    };
  }

  const body = buildDeviceParams(input.authRequest);
  // RFC 8628 §3.1: the device authorization request carries client_id in the
  // body — even for a confidential client whose secret goes in the auth header.
  body.set("client_id", input.client.clientId);
  const headers = new Headers({
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  });

  // Confidential clients add real auth on top (Basic / post / private_key_jwt).
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
        ? "CORS / network error reaching the device endpoint. Enable CORS on the AS for this origin."
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
      message: `AS returned ${response.status} from the device endpoint.`,
      status: response.status,
      body: responseBody,
    };
  }

  let parsed: {
    device_code?: unknown;
    user_code?: unknown;
    verification_uri?: unknown;
    verification_uri_complete?: unknown;
    expires_in?: unknown;
    interval?: unknown;
  };
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    return {
      ok: false,
      message: "Device response was not JSON.",
      status: response.status,
      body: responseBody,
    };
  }

  if (
    typeof parsed.device_code !== "string" ||
    typeof parsed.user_code !== "string" ||
    typeof parsed.verification_uri !== "string"
  ) {
    return {
      ok: false,
      message:
        "Device response is missing `device_code`, `user_code`, or `verification_uri`.",
      status: response.status,
      body: responseBody,
    };
  }

  return {
    ok: true,
    deviceCode: parsed.device_code,
    userCode: parsed.user_code,
    verificationUri: parsed.verification_uri,
    verificationUriComplete:
      typeof parsed.verification_uri_complete === "string"
        ? parsed.verification_uri_complete
        : undefined,
    expiresIn: typeof parsed.expires_in === "number" ? parsed.expires_in : 600,
    interval: typeof parsed.interval === "number" ? parsed.interval : 5,
    raw: parsed,
  };
}
