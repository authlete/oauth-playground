// Client ID Metadata Document (CIMD, draft-ietf-oauth-client-id-metadata-document).
// The playground is itself an OAuth client, so it can host its own metadata
// document and use that URL as its client_id — registration-free identity. The
// AS fetches the URL server-side (no CORS), reads the metadata, and knows who
// the client is. No secrets are permitted, which is exactly a public + PKCE
// client. Kept dependency-free so the Vite plugin (Node) and the app (browser)
// share one source of truth for what the document contains.

/** The document's own URL — this becomes the client_id. CIMD requires an
 * absolute URL with a path component; we serve it at a fixed path. */
export function clientMetadataUrl(origin: string): string {
  return `${trimOrigin(origin)}/client-metadata.json`;
}

/** The metadata document the AS fetches. Public client (no secret) so it fits
 * CIMD's prohibition on symmetric credentials; `client_id` must equal the URL
 * it is served from (the spec compares them with simple string equality). */
export function buildClientMetadata(origin: string): Record<string, unknown> {
  const o = trimOrigin(origin);
  return {
    client_id: clientMetadataUrl(o),
    client_name: "Authlete OAuth Playground",
    client_uri: o,
    redirect_uris: [`${o}/callback`],
    token_endpoint_auth_method: "none",
    grant_types: [
      "authorization_code",
      "refresh_token",
      "urn:ietf:params:oauth:grant-type:device_code",
    ],
    response_types: ["code"],
    scope: "openid profile email",
    // RAR types this client may request (RFC 9396) — mirrors what DCR registers.
    authorization_details_types: [
      "Accounts",
      "CreditCardAccounts",
      "SinglePayments",
    ],
  };
}

function trimOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}
