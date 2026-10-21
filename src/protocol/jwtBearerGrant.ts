// JWT Bearer authorization grant (RFC 7523 §2.1): present a signed JWT (the
// `assertion`) at /token to obtain a token — no redirect, no polling. The grant
// is independent of client authentication (private_key_jwt) and DPoP, which may
// ride alongside it. The assertion is signed by its issuer: the client (its
// Client-config key) or a separate trusted issuer.

import { applyClientAuth } from "./clientAuth";
import { authorizationDetailsWireValue } from "./authorizationDetails";
import { send } from "./dpopHttp";
import type { DpopContext } from "./dpop";
import { validateAndImportJwk } from "./jwk";
import { signCompactJws } from "./jws";
import { randomBase64Url } from "./random";
import { parseTokenResponse, type TokenExchangeResult } from "./tokenExchange";
import {
  JWT_BEARER_GRANT_TYPE,
  type AuthRequestState,
  type ClientConfigState,
  type JwtBearerState,
  type NetworkEntry,
  type OidcMetadata,
} from "../types";

export type BuildAssertionResult =
  { ok: true; jwt: string } | { ok: false; message: string };

export interface BuildAssertionInput {
  client: ClientConfigState;
  /** The AS issuer identifier (metadata.issuer) — used as aud when audMode is
   * "issuer". Not the assertion's `iss` claim. */
  asIssuer: string;
  /** aud when audMode is "token". */
  tokenEndpoint: string;
  jwtBearer: JwtBearerState;
}

/** The key that signs the assertion: the client's key when the client is the
 * issuer, or the external issuer's key otherwise. */
export function signingJwkText(
  client: ClientConfigState,
  jwtBearer: JwtBearerState,
): string {
  return jwtBearer.issuerMode === "external"
    ? jwtBearer.externalJwk
    : client.privateKey.jwkText;
}

/** The `iss` claim: the client, or the named external issuer. */
function assertionIssuer(
  client: ClientConfigState,
  jwtBearer: JwtBearerState,
): string {
  return jwtBearer.issuerMode === "external"
    ? jwtBearer.externalIssuer.trim()
    : client.clientId;
}

/** Build + sign the grant assertion (RFC 7523 §3). `iss`/`sub` name the issuer
 * and the user; `aud` identifies the AS. The signing key need not be the
 * client's — different trust models let a third-party issuer sign it. */
export async function buildGrantAssertion(
  input: BuildAssertionInput,
): Promise<BuildAssertionResult> {
  const validated = await validateAndImportJwk(
    signingJwkText(input.client, input.jwtBearer),
  );
  if (!validated.ok) {
    return {
      ok: false,
      message: `Signing key is invalid: ${validated.message}`,
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const aud =
    input.jwtBearer.audMode === "issuer" ? input.asIssuer : input.tokenEndpoint;

  const header: Record<string, unknown> = { alg: validated.alg, typ: "JWT" };
  if (validated.kid) header.kid = validated.kid;

  const payload: Record<string, unknown> = {
    iss: assertionIssuer(input.client, input.jwtBearer),
    sub: input.jwtBearer.subject,
    aud,
    iat: now,
    exp: now + Math.max(1, Math.floor(input.jwtBearer.lifetimeSecs)),
  };
  if (input.jwtBearer.includeNbf) payload.nbf = now;
  if (input.jwtBearer.includeJti) payload.jti = randomBase64Url(16);

  const jwt = await signCompactJws({
    header,
    payload,
    cryptoKey: validated.cryptoKey,
    alg: validated.alg,
  });
  return { ok: true, jwt };
}

/** Request body without the assertion or client auth — the caller adds those.
 * scope / resource / RAR come from the Auth request, mirroring Device/CIBA. */
export function buildJwtBearerParams(
  authRequest: AuthRequestState,
): URLSearchParams {
  const body = new URLSearchParams();
  body.set("grant_type", JWT_BEARER_GRANT_TYPE);
  if (authRequest.scopes.length)
    body.set("scope", authRequest.scopes.join(" "));
  if (authRequest.resource.trim())
    body.set("resource", authRequest.resource.trim());
  if (
    authRequest.authorizationDetailsEnabled &&
    authRequest.authorizationDetails.trim()
  ) {
    body.set(
      "authorization_details",
      authorizationDetailsWireValue(authRequest.authorizationDetails),
    );
  }
  return body;
}

export interface JwtBearerRequestInput {
  metadata: OidcMetadata;
  client: ClientConfigState;
  authRequest: AuthRequestState;
  jwtBearer: JwtBearerState;
  dpop?: DpopContext;
  onDpopNonce?: (nonce: string) => void;
  onStart: (entry: NetworkEntry) => void;
  onFinish: (id: string, patch: Partial<NetworkEntry>) => void;
}

export async function requestJwtBearerToken(
  input: JwtBearerRequestInput,
): Promise<TokenExchangeResult> {
  const endpoint = input.metadata.token_endpoint;
  if (typeof endpoint !== "string") {
    return { ok: false, message: "Discovery metadata has no token_endpoint." };
  }

  const assertion = await buildGrantAssertion({
    client: input.client,
    asIssuer: input.metadata.issuer,
    tokenEndpoint: endpoint,
    jwtBearer: input.jwtBearer,
  });
  if (!assertion.ok) return { ok: false, message: assertion.message };

  const body = buildJwtBearerParams(input.authRequest);
  body.set("assertion", assertion.jwt);

  const headers = new Headers({
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  });
  // Client authentication is separate from the grant: private_key_jwt adds the
  // client_assertion (second JWT), and every method sets client_id.
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
        ? "CORS / network error reaching /token. Enable CORS on the AS for this origin."
        : err instanceof Error
          ? err.message
          : String(err),
  });
  if (!sent.ok) return { ok: false, message: sent.message };
  return parseTokenResponse(sent.response, sent.bodyText);
}
