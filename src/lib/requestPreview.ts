// Build a wire-level HTTP-message preview for the request a step is about
// to send. Used by step 4 (PAR) and step 5 (Authorize). For private_key_jwt
// we elide the actual signed assertion — it's regenerated at send time
// with a fresh `jti` / `iat` / `exp` — and show a `<signed at send time>`
// placeholder instead.

import { buildAuthorizeParams } from "./authorizeUrl";
import type { AuthRequestState, ClientConfigState } from "../types";

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
  const body = buildAuthorizeParams(client, authRequest);
  const headers: Array<[string, string]> = [
    ["Content-Type", "application/x-www-form-urlencoded"],
    ["Accept", "application/json"],
  ];
  const notes: string[] = [];
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
  if (parRequestUri) {
    params.set("client_id", client.clientId);
    params.set("request_uri", parRequestUri);
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
