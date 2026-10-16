// Refresh-token grant (RFC 6749 §6). Same /token endpoint as Token exchange,
// with grant_type=refresh_token. The AS may return a rotated refresh_token
// (one-time-use refresh tokens are common in FAPI / OAuth 2.1).

import { applyClientAuth } from "./clientAuth";
import { send } from "./dpopHttp";
import type { DpopContext } from "./dpop";
import type { ClientConfigState, NetworkEntry, OidcMetadata } from "../types";

export interface RefreshSuccess {
  ok: true;
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
  refreshToken?: string;
  idToken?: string;
  scope?: string;
  raw: Record<string, unknown>;
}

export interface RefreshError {
  ok: false;
  message: string;
  status?: number;
  body?: string;
  error?: string;
  errorDescription?: string;
}

export type RefreshResult = RefreshSuccess | RefreshError;

export interface RefreshInput {
  metadata: OidcMetadata;
  client: ClientConfigState;
  refreshToken: string;
  downscope?: string;
  dpop?: DpopContext;
  onDpopNonce?: (nonce: string) => void;
  onStart: (entry: NetworkEntry) => void;
  onFinish: (id: string, patch: Partial<NetworkEntry>) => void;
}

export async function refreshTokens(
  input: RefreshInput,
): Promise<RefreshResult> {
  const endpoint = input.metadata.token_endpoint;
  if (typeof endpoint !== "string") {
    return { ok: false, message: "Discovery metadata has no token_endpoint." };
  }
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", input.refreshToken);
  if (input.downscope?.trim()) body.set("scope", input.downscope.trim());

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
  if (!auth.ok) return { ok: false, message: auth.message };

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
        ? "CORS / network error reaching /token (refresh)."
        : err instanceof Error
          ? err.message
          : String(err),
  });
  if (!sent.ok) return { ok: false, message: sent.message };
  const { response, bodyText: responseBody } = sent;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(responseBody) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      message: "/token response was not JSON.",
      status: response.status,
      body: responseBody,
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      message: `AS returned ${response.status} from /token.`,
      status: response.status,
      body: responseBody,
      error: typeof parsed.error === "string" ? parsed.error : undefined,
      errorDescription:
        typeof parsed.error_description === "string"
          ? parsed.error_description
          : undefined,
    };
  }
  if (typeof parsed.access_token !== "string") {
    return {
      ok: false,
      message: "/token response is missing `access_token`.",
      status: response.status,
      body: responseBody,
    };
  }
  return {
    ok: true,
    accessToken: parsed.access_token,
    tokenType:
      typeof parsed.token_type === "string" ? parsed.token_type : "Bearer",
    expiresIn:
      typeof parsed.expires_in === "number" ? parsed.expires_in : undefined,
    refreshToken:
      typeof parsed.refresh_token === "string"
        ? parsed.refresh_token
        : undefined,
    idToken: typeof parsed.id_token === "string" ? parsed.id_token : undefined,
    scope: typeof parsed.scope === "string" ? parsed.scope : undefined,
    raw: parsed,
  };
}
