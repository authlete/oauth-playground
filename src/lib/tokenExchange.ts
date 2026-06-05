// Step 6: exchange the authorization code at the AS /token endpoint
// (RFC 6749 §4.1.3). Client auth comes from step 2 (lib/clientAuth.ts).
// PKCE verifier (RFC 7636 §4.5) is included when step 3 used PKCE.

import { applyClientAuth } from "./clientAuth";
import type {
  AuthRequestState,
  ClientConfigState,
  NetworkEntry,
  OidcMetadata,
} from "../types";

export interface TokenSuccess {
  ok: true;
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
  refreshToken?: string;
  idToken?: string;
  scope?: string;
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
  if (input.client.redirectUri) body.set("redirect_uri", input.client.redirectUri);
  if (input.authRequest.pkceEnabled && input.authRequest.codeVerifier) {
    body.set("code_verifier", input.authRequest.codeVerifier);
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
        ? "CORS / network error reaching /token. Enable CORS on the AS or wait for the v0.2 relay."
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
      typeof parsed.refresh_token === "string" ? parsed.refresh_token : undefined,
    idToken: typeof parsed.id_token === "string" ? parsed.id_token : undefined,
    scope: typeof parsed.scope === "string" ? parsed.scope : undefined,
    raw: parsed,
  };
}
