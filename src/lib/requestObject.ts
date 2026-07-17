// JAR (RFC 9101): sign the authorization request parameters into a JWT — the
// "request object". Signed in the browser with the client's private JWK (the
// same key step 2 uses for private_key_jwt). The store is the single signer:
// it re-signs into state.authRequest.requestObjectJwt on every param/key edit,
// and step 3 / step 4 / step 5 all read that one value.

import { buildAuthorizeParams } from "./authorizeUrl";
import { validateAndImportJwk } from "./jwk";
import { signCompactJws } from "./jws";
import { randomBase64Url } from "./random";
import type {
  AuthRequestState,
  ClientConfigState,
  OidcMetadata,
} from "../types";

// RFC 9101 §10.8 — explicit media type to prevent cross-JWT confusion.
export const JAR_REQUEST_OBJECT_TYP = "oauth-authz-req+jwt";

// Lifetime of the signed request object. FAPI requires a short window.
const REQUEST_OBJECT_TTL_SECONDS = 300;

export interface SignRequestObjectInput {
  metadata: OidcMetadata;
  client: ClientConfigState;
  authRequest: AuthRequestState;
}

export type SignRequestObjectResult =
  | { ok: true; jwt: string; alg: string; kid?: string; claimNames: string[] }
  | { ok: false; message: string };

export async function signRequestObject(
  input: SignRequestObjectInput,
): Promise<SignRequestObjectResult> {
  const validated = await validateAndImportJwk(input.client.privateKey.jwkText);
  if (!validated.ok) {
    return { ok: false, message: `JAR needs a signing key — ${validated.message}` };
  }

  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {};
  for (const [k, v] of buildAuthorizeParams(input.client, input.authRequest)) {
    claims[k] = v;
  }
  // Registered claims (RFC 9101 §5.1 / FAPI 2.0 message signing).
  claims.iss = input.client.clientId;
  claims.aud = input.metadata.issuer;
  claims.iat = now;
  claims.nbf = now;
  claims.exp = now + REQUEST_OBJECT_TTL_SECONDS;
  claims.jti = randomBase64Url(16);

  const header: Record<string, string> = {
    alg: validated.alg,
    typ: JAR_REQUEST_OBJECT_TYP,
  };
  if (validated.kid) header.kid = validated.kid;

  try {
    const jwt = await signCompactJws({
      header,
      payload: claims,
      cryptoKey: validated.cryptoKey,
      alg: validated.alg,
    });
    return {
      ok: true,
      jwt,
      alg: validated.alg,
      kid: validated.kid,
      claimNames: Object.keys(claims),
    };
  } catch (e) {
    return {
      ok: false,
      message: `Signing the request object failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// Sync gate: JAR requires a valid signing key before the request can be built.
// Used by the step cascade and the step-4/5 send buttons.
export function jarReadiness(
  client: ClientConfigState,
  authRequest: AuthRequestState,
): { ok: true } | { ok: false; message: string } {
  if (!authRequest.jarEnabled) return { ok: true };
  if (client.privateKey.status === "valid") return { ok: true };
  return {
    ok: false,
    message:
      "JAR is on — paste a valid private JWK in step 2 to sign the request object.",
  };
}
