// Single source of truth for the /authorize URL. Used by:
//  - step 3 (URL preview),
//  - step 4 (the body it POSTs to /par),
//  - step 5 (the URL it navigates to, optionally with request_uri from step 4).

import type {
  AuthRequestState,
  ClientConfigState,
  OidcMetadata,
  ResponseMode,
} from "../types";

export type AuthorizeUrlResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

export function buildAuthorizeParams(
  client: ClientConfigState,
  req: AuthRequestState,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("response_type", req.responseType);
  params.set("client_id", client.clientId);
  if (client.redirectUri) params.set("redirect_uri", client.redirectUri);
  params.set("scope", req.scopes.join(" "));
  if (req.state) params.set("state", req.state);
  if (req.nonce && req.scopes.includes("openid")) params.set("nonce", req.nonce);
  if (
    req.responseMode &&
    req.responseMode !== defaultResponseMode(req.responseType)
  ) {
    params.set("response_mode", req.responseMode);
  }
  if (req.pkceEnabled && req.codeChallenge) {
    params.set("code_challenge", req.codeChallenge);
    params.set("code_challenge_method", "S256");
  }
  if (req.prompt.trim()) params.set("prompt", req.prompt.trim());
  if (req.maxAge.trim()) params.set("max_age", req.maxAge.trim());
  if (req.loginHint.trim()) params.set("login_hint", req.loginHint.trim());
  // OpenID Federation 1.0: pass through verbatim (already a JSON array string).
  if (req.trustChain.trim()) params.set("trust_chain", req.trustChain.trim());
  return params;
}

export function buildAuthorizeUrl(
  metadata: OidcMetadata | undefined,
  client: ClientConfigState,
  req: AuthRequestState,
  parRequestUri?: string,
): AuthorizeUrlResult {
  if (!metadata?.authorization_endpoint) {
    return { ok: false, message: "Authorization endpoint not loaded — run Discovery first." };
  }
  if (!client.clientId.trim()) {
    return { ok: false, message: "Client ID is empty — set it in step 2." };
  }
  if (!client.redirectUri.trim()) {
    return { ok: false, message: "Redirect URI is empty — set it in step 2." };
  }
  if (req.scopes.length === 0) {
    return { ok: false, message: "Pick at least one scope." };
  }

  const base = metadata.authorization_endpoint;
  const sep = base.includes("?") ? "&" : "?";

  if (parRequestUri) {
    // PAR mode — the AS already has the params; the redirect URL only carries
    // the request_uri + client_id (RFC 9126 §4).
    const p = new URLSearchParams();
    p.set("client_id", client.clientId);
    p.set("request_uri", parRequestUri);
    return { ok: true, url: `${base}${sep}${p.toString()}` };
  }

  if (req.jarEnabled && req.requestObjectJwt) {
    // JAR by value (RFC 9101 §6.1) — params ride inside the signed request
    // object; only client_id/response_type/scope stay in the clear.
    const params = buildJarParams(client, req, req.requestObjectJwt);
    return { ok: true, url: `${base}${sep}${params.toString()}` };
  }

  const params = buildAuthorizeParams(client, req);
  return { ok: true, url: `${base}${sep}${params.toString()}` };
}

// Outer params for a by-value JAR request. client_id + response_type + scope
// stay in the clear (OIDC Core §6.1); everything else rides inside `request`.
export function buildJarParams(
  client: ClientConfigState,
  req: AuthRequestState,
  requestJwt: string,
): URLSearchParams {
  const p = new URLSearchParams();
  p.set("client_id", client.clientId);
  p.set("response_type", req.responseType);
  p.set("scope", req.scopes.join(" "));
  p.set("request", requestJwt);
  return p;
}

export function defaultResponseMode(responseType: string): ResponseMode {
  // Per OAuth 2.0 Multiple Response Type Encoding Practices.
  if (responseType === "code") return "query";
  return "fragment";
}
