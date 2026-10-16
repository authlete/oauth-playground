// One device access-token poll (RFC 8628 §3.4). Classifies a single response;
// the loop lives in steps/Device.tsx. Same error vocabulary as CIBA.

import { applyClientAuth } from "./clientAuth";
import { send } from "./dpopHttp";
import type { DpopContext } from "./dpop";
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
  dpop?: DpopContext;
  onDpopNonce?: (nonce: string) => void;
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

  const sent = await send({
    method: "POST",
    url: endpoint,
    headers,
    body: body.toString(),
    dpop: input.dpop
      ? { ctx: input.dpop, onNonce: input.onDpopNonce }
      : undefined,
    onStart: input.onStart,
    onFinish: input.onFinish,
    networkErrorMessage: (err) =>
      err instanceof TypeError
        ? "CORS / network error reaching /token. Enable CORS on the AS for this origin."
        : err instanceof Error
          ? err.message
          : String(err),
  });
  if (!sent.ok) return { kind: "error", message: sent.message };
  const { response, bodyText: responseBody } = sent;

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
