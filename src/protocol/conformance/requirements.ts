// The conformance index: the client-side MUSTs the playground implements,
// each proven by a test named with its id (see test/conformance/*). Grows one
// capability at a time; the meta-test refuses a requirement with no test and a
// test that names an unknown id.

import type { Requirement } from "./types";

export const REQUIREMENTS: Requirement[] = [
  // ── PKCE (RFC 7636) ──────────────────────────────────────────────────────
  {
    id: "pkce.verifier",
    level: "MUST",
    spec: "RFC 7636",
    section: "4.1",
    capability: "pkce",
    text: "The code_verifier is 43–128 characters from the unreserved set.",
  },
  {
    id: "pkce.challenge",
    level: "MUST",
    spec: "RFC 7636",
    section: "4.2",
    capability: "pkce",
    text: "With S256 the code_challenge is BASE64URL(SHA-256(code_verifier)).",
  },
  {
    id: "pkce.authorize-param",
    level: "MUST",
    spec: "RFC 7636",
    section: "4.3",
    capability: "pkce",
    text: "The authorization request carries code_challenge and code_challenge_method=S256.",
  },
  {
    id: "pkce.token-param",
    level: "MUST",
    spec: "RFC 7636",
    section: "4.5",
    capability: "pkce",
    text: "The token request carries the code_verifier.",
  },

  // ── Authorization request (RFC 6749 §4.1.1) ──────────────────────────────
  {
    id: "authz.required-params",
    level: "MUST",
    spec: "RFC 6749",
    section: "4.1.1",
    capability: "authorize",
    text: "The authorization request carries response_type, client_id, redirect_uri and scope.",
  },

  // ── state / iss (RFC 6749 §10.12, RFC 9207) ──────────────────────────────
  {
    id: "state.sent",
    level: "MUST",
    spec: "RFC 6749",
    section: "10.12",
    capability: "authorize",
    text: "The client sends an unguessable state value on the authorization request.",
  },
  {
    id: "state.compared",
    level: "MUST",
    spec: "RFC 6749",
    section: "10.12",
    capability: "authorize",
    text: "The client rejects the callback when returned state does not equal the sent value.",
  },
  {
    id: "iss.compared",
    level: "MUST",
    spec: "RFC 9207",
    section: "2.4",
    capability: "authorize",
    text: "The client checks the iss authorization response parameter against the AS issuer.",
  },

  // ── Token exchange (RFC 6749 §4.1.3) ─────────────────────────────────────
  {
    id: "token.grant",
    level: "MUST",
    spec: "RFC 6749",
    section: "4.1.3",
    capability: "token",
    text: "The token request uses grant_type=authorization_code with code and redirect_uri.",
  },

  // ── Client authentication ────────────────────────────────────────────────
  {
    id: "clientauth.private-key-jwt-claims",
    level: "MUST",
    spec: "RFC 7523",
    section: "3",
    capability: "client-auth",
    text: "The private_key_jwt assertion sets iss=sub=client_id, aud=token endpoint, and exp.",
  },
  {
    id: "clientauth.assertion-type",
    level: "MUST",
    spec: "RFC 7521",
    section: "4.2",
    capability: "client-auth",
    text: "private_key_jwt sends client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer.",
  },
  {
    id: "clientauth.secret-basic",
    level: "MUST",
    spec: "RFC 6749",
    section: "2.3.1",
    capability: "client-auth",
    text: "client_secret_basic sends Authorization: Basic base64(client_id:secret).",
  },

  // ── Resource indicator (RFC 8707) ────────────────────────────────────────
  {
    id: "resource.authorize-param",
    level: "SHOULD",
    spec: "RFC 8707",
    section: "2",
    capability: "resource-indicator",
    text: "When set, the resource indicator is carried on the authorization request.",
  },

  // ── CIMD (draft-ietf-oauth-client-id-metadata-document) ──────────────────
  {
    id: "cimd.client-id-matches",
    level: "MUST",
    spec: "draft-ietf-oauth-client-id-metadata-document",
    section: "2",
    capability: "cimd",
    text: "The metadata document's client_id equals the URL it is served from.",
  },
  {
    id: "cimd.no-secret",
    level: "MUST",
    spec: "draft-ietf-oauth-client-id-metadata-document",
    section: "2",
    capability: "cimd",
    text: "The metadata document contains no client_secret or symmetric credential.",
  },
  {
    id: "cimd.url-shape",
    level: "MUST",
    spec: "draft-ietf-oauth-client-id-metadata-document",
    section: "2.1",
    capability: "cimd",
    text: "The client_id URL has a path component and no fragment.",
  },

  // ── With-the-token: refresh / revoke / introspect / userinfo ─────────────
  {
    id: "refresh.grant",
    level: "MUST",
    spec: "RFC 6749",
    section: "6",
    capability: "refresh",
    text: "The refresh request uses grant_type=refresh_token with the refresh_token.",
  },
  {
    id: "revoke.request",
    level: "MUST",
    spec: "RFC 7009",
    section: "2.1",
    capability: "revoke",
    text: "Revocation POSTs the token (with optional token_type_hint) to the revocation endpoint.",
  },
  {
    id: "introspect.request",
    level: "MUST",
    spec: "RFC 7662",
    section: "2.1",
    capability: "introspect",
    text: "Introspection POSTs the token to the introspection endpoint.",
  },
  {
    id: "userinfo.bearer",
    level: "MUST",
    spec: "OpenID Connect Core",
    section: "5.3.1",
    capability: "userinfo",
    text: "The UserInfo request sends the access token in an Authorization: Bearer header.",
  },

  // ── Device Authorization Grant (RFC 8628) ────────────────────────────────
  {
    id: "device.client-id",
    level: "MUST",
    spec: "RFC 8628",
    section: "3.1",
    capability: "device",
    text: "The device authorization request carries client_id in the body, even for a confidential client.",
  },
];

/** Deliberately fixed so a dropped or silently-added requirement fails the
 * meta-test. Update it only when you mean to change the index. */
export const EXPECTED_REQUIREMENT_COUNT = 21;
