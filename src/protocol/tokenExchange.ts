// Exchange the authorization code at the AS /token endpoint
// (RFC 6749 §4.1.3). Client auth comes from Client config (lib/clientAuth.ts).
// PKCE verifier (RFC 7636 §4.5) is included when the auth request used PKCE.

import { applyClientAuth } from "./clientAuth";
import { authorizationDetailsWireValue } from "./authorizationDetails";
import type {
  AuthRequestState,
  ClientConfigState,
  NetworkEntry,
  OidcMetadata,
  TokenState,
} from "../types";

export interface TokenSuccess {
  ok: true;
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
  refreshToken?: string;
  idToken?: string;
  scope?: string;
  authorizationDetails?: Array<Record<string, unknown>>;
  grantId?: string;
  raw: Record<string, unknown>;
}

export interface TokenError {
  ok: false;
  message: string;
  status?: number;
  body?: string;
  error?: string;
  errorDescription?: string;
}

export type TokenExchangeResult = TokenSuccess | TokenError;

/** Token response → success shape, or null when there's no `access_token`.
 * Shared by the code exchange and the CIBA poll. */
export function parseTokenSuccessBody(
  parsed: Record<string, unknown>,
): Omit<TokenSuccess, "ok"> | null {
  if (typeof parsed.access_token !== "string") return null;
  return {
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
    authorizationDetails: Array.isArray(parsed.authorization_details)
      ? (parsed.authorization_details as Array<Record<string, unknown>>)
      : undefined,
    grantId: typeof parsed.grant_id === "string" ? parsed.grant_id : undefined,
    raw: parsed,
  };
}

/** Exchange result → TokenState patch. Shared by the manual Exchange button
 * and the auto-pilot so both land identical state. */
export function tokenStatePatchFromResult(
  result: TokenExchangeResult,
  now: number,
): Partial<TokenState> {
  if (!result.ok) {
    return {
      status: "error",
      error: result.error,
      errorDescription: result.errorDescription,
      errorStatus: result.status,
      errorBody: result.body,
    };
  }
  return {
    status: "success",
    accessToken: result.accessToken,
    tokenType: result.tokenType,
    expiresIn: result.expiresIn,
    expiresAt:
      typeof result.expiresIn === "number"
        ? now + result.expiresIn * 1000
        : undefined,
    refreshToken: result.refreshToken,
    idToken: result.idToken,
    scope: result.scope,
    authorizationDetails: result.authorizationDetails,
    grantId: result.grantId,
    exchangedAt: now,
  };
}

export interface TokenExchangeInput {
  metadata: OidcMetadata;
  client: ClientConfigState;
  authRequest: AuthRequestState;
  code: string;
  onStart: (entry: NetworkEntry) => void;
  onFinish: (id: string, patch: Partial<NetworkEntry>) => void;
}

export async function exchangeCode(
  input: TokenExchangeInput,
): Promise<TokenExchangeResult> {
  const endpoint = input.metadata.token_endpoint;
  if (typeof endpoint !== "string") {
    return {
      ok: false,
      message: "Discovery metadata has no token_endpoint.",
    };
  }

  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", input.code);
  if (input.client.redirectUri)
    body.set("redirect_uri", input.client.redirectUri);
  if (input.authRequest.pkceEnabled && input.authRequest.codeVerifier) {
    body.set("code_verifier", input.authRequest.codeVerifier);
  }
  // RFC 8707: repeat the resource indicator at the token endpoint so the
  // issued access token is audience-restricted to it.
  if (input.authRequest.resource.trim()) {
    body.set("resource", input.authRequest.resource.trim());
  }
  // RAR: repeat authorization_details at the token endpoint so the issued
  // access token carries the fine-grained grant.
  if (
    input.authRequest.authorizationDetailsEnabled &&
    input.authRequest.authorizationDetails.trim()
  ) {
    body.set(
      "authorization_details",
      authorizationDetailsWireValue(input.authRequest.authorizationDetails),
    );
  }

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
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

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

  const success = parseTokenSuccessBody(parsed);
  if (!success) {
    return {
      ok: false,
      message: "/token response is missing `access_token`.",
      status: response.status,
      body: responseBody,
    };
  }

  return { ok: true, ...success };
}
