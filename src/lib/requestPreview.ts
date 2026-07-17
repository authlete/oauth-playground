// Build a wire-level HTTP-message preview for the request a step is about
// to send. Used by step 4 (PAR) and step 5 (Authorize). For private_key_jwt
// we elide the actual signed assertion — it's regenerated at send time
// with a fresh `jti` / `iat` / `exp` — and show a `<signed at send time>`
// placeholder instead.

import { buildAuthorizeParams, buildJarParams } from "./authorizeUrl";
import type { AuthRequestState, ClientConfigState } from "../types";

// Shown only before a valid signing key exists; normally the real signed JWT
// (authRequest.requestObjectJwt) is in the URL/body and decoded via JwtPanel.
const JAR_PENDING = "<awaiting a valid signing key in step 2>";

function jarRequestValue(authRequest: AuthRequestState): string {
  return authRequest.requestObjectJwt ?? JAR_PENDING;
}

function jarNote(client: ClientConfigState, signed: boolean): string {
  if (!signed) {
    return "request: signed once a valid private JWK is set in step 2 (JAR, RFC 9101).";
  }
  const { alg, kid } = client.privateKey;
  return (
    `request: signed request object (JAR, RFC 9101), ${alg ?? "?"}` +
    `${kid ? ` · kid=${kid}` : ""} — decoded above; refreshed on each send.`
  );
}

export interface PreviewBlock {
  method: "GET" | "POST";
  url: string;
  headers: Array<[string, string]>;
  body?: string;
  /** Extra notes shown after the body, e.g. "client_assertion is signed at send time." */
  notes?: string[];
}

export function previewPar(
  endpoint: string,
  client: ClientConfigState,
  authRequest: AuthRequestState,
): PreviewBlock {
  const body = authRequest.jarEnabled
    ? buildJarParams(client, authRequest, jarRequestValue(authRequest))
    : buildAuthorizeParams(client, authRequest);
  const headers: Array<[string, string]> = [
    ["Content-Type", "application/x-www-form-urlencoded"],
    ["Accept", "application/json"],
  ];
  const notes: string[] = [];
  if (authRequest.jarEnabled)
    notes.push(jarNote(client, !!authRequest.requestObjectJwt));
  applyClientAuthPreview(client, headers, body, notes);
  return {
    method: "POST",
    url: endpoint,
    headers,
    body: body.toString(),
    notes: notes.length ? notes : undefined,
  };
}

export function previewAuthorize(
  endpoint: string,
  client: ClientConfigState,
  authRequest: AuthRequestState,
  parRequestUri?: string,
): PreviewBlock {
  const params = new URLSearchParams();
  const notes: string[] = [];
  if (parRequestUri) {
    params.set("client_id", client.clientId);
    params.set("request_uri", parRequestUri);
  } else if (authRequest.jarEnabled) {
    for (const [k, v] of buildJarParams(client, authRequest, jarRequestValue(authRequest))) {
      params.set(k, v);
    }
    notes.push(jarNote(client, !!authRequest.requestObjectJwt));
  } else {
    for (const [k, v] of buildAuthorizeParams(client, authRequest)) {
      params.set(k, v);
    }
  }
  const sep = endpoint.includes("?") ? "&" : "?";
  return {
    method: "GET",
    url: `${endpoint}${sep}${params.toString()}`,
    headers: [],
    notes: notes.length ? notes : undefined,
  };
}

function applyClientAuthPreview(
  client: ClientConfigState,
  headers: Array<[string, string]>,
  body: URLSearchParams,
  notes: string[],
): void {
  switch (client.authMethod) {
    case "none":
      if (!body.has("client_id")) body.set("client_id", client.clientId);
      return;
    case "client_secret_basic": {
      const encoded = btoa(`${client.clientId}:${client.clientSecret || ""}`);
      headers.push(["Authorization", `Basic ${encoded}`]);
      return;
    }
    case "client_secret_post":
      body.set("client_id", client.clientId);
      body.set("client_secret", "<client_secret>");
      notes.push("client_secret is read from step 2 at send time.");
      return;
    case "private_key_jwt":
      body.set("client_id", client.clientId);
      body.set(
        "client_assertion_type",
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      );
      body.set("client_assertion", "<signed JWT — created at send time>");
      notes.push(
        `client_assertion: JWT signed with the imported JWK${
          client.privateKey.alg ? ` (${client.privateKey.alg})` : ""
        }${
          client.privateKey.kid ? `, kid=${client.privateKey.kid}` : ""
        }; iat/exp/jti regenerated on each send.`,
      );
      return;
  }
}

/** Pretty-print a body of `application/x-www-form-urlencoded` — one param per line. */
export function formatFormBody(body: string): string {
  if (!body) return "";
  return body
    .split("&")
    .map((kv) => `  ${kv}`)
    .join("\n");
}

/** Pretty-print a URL as `${base}\n  ?param1\n  &param2...`. */
export function prettyUrl(url: string): string {
  const qIdx = url.indexOf("?");
  if (qIdx < 0) return url;
  const base = url.slice(0, qIdx);
  const query = url.slice(qIdx + 1);
  const lines = query
    .split("&")
    .map((kv, i) => (i === 0 ? `  ?${kv}` : `  &${kv}`));
  return `${base}\n${lines.join("\n")}`;
}
