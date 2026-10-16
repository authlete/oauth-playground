// One device access-token poll (RFC 8628 §3.4). Classifies a single response;
// the loop lives in steps/Device.tsx. Same error vocabulary as CIBA.

import { applyClientAuth } from "./clientAuth";
import { parseTokenSuccessBody, type TokenSuccess } from "./tokenExchange";
import type { ClientConfigState, NetworkEntry, OidcMetadata } from "../types";

export const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

export type DevicePollOutcome =
  | { kind: "success"; token: Omit<TokenSuccess, "ok"> }
  | { kind: "pending" }
  | { kind: "slow_down" }
  | { kind: "expired"; message: string }
  | { kind: "denied"; message: string }
  | {
      kind: "error";
      message: string;
      status?: number;
      body?: string;
    };

export interface DevicePollInput {
  metadata: OidcMetadata;
  client: ClientConfigState;
  deviceCode: string;
  onStart: (entry: NetworkEntry) => void;
  onFinish: (id: string, patch: Partial<NetworkEntry>) => void;
}

export async function pollDeviceToken(
  input: DevicePollInput,
): Promise<DevicePollOutcome> {
  const endpoint = input.metadata.token_endpoint;
  if (typeof endpoint !== "string") {
    return {
      kind: "error",
      message: "Discovery metadata has no token_endpoint.",
    };
  }

  const body = new URLSearchParams();
  body.set("grant_type", DEVICE_GRANT_TYPE);
  body.set("device_code", input.deviceCode);

  const headers = new Headers({
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  });
  const auth = await applyClientAuth({
    client: input.client,
    audience: endpoint,
    headers,
    body,
  });
  if (!auth.ok) return { kind: "error", message: auth.message };

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
        ? "CORS / network error reaching /token. Enable CORS on the AS for this origin."
        : err instanceof Error
          ? err.message
          : String(err);
    input.onFinish(id, {
      finishedAt,
      durationMs: Math.round(finishedAt - startedAt),
      errorMessage: message,
    });
    return { kind: "error", message };
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

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(responseBody) as Record<string, unknown>;
  } catch {
    return {
      kind: "error",
      message: "/token response was not JSON.",
      status: response.status,
      body: responseBody,
    };
  }

  if (response.ok) {
    const token = parseTokenSuccessBody(parsed);
    if (!token) {
      return {
        kind: "error",
        message: "/token response is missing `access_token`.",
        status: response.status,
        body: responseBody,
      };
    }
    return { kind: "success", token };
  }

  const error = typeof parsed.error === "string" ? parsed.error : "";
  const description =
    typeof parsed.error_description === "string"
      ? parsed.error_description
      : undefined;
  switch (error) {
    case "authorization_pending":
      return { kind: "pending" };
    case "slow_down":
      return { kind: "slow_down" };
    case "expired_token":
      return {
        kind: "expired",
        message:
          description ?? "The device_code expired before the user approved.",
      };
    case "access_denied":
      return {
        kind: "denied",
        message:
          description ?? "The user denied the request at the verification URI.",
      };
    default:
      return {
        kind: "error",
        message:
          description ??
          `AS returned ${response.status} from /token${error ? ` (${error})` : ""}.`,
        status: response.status,
        body: responseBody,
      };
  }
}
