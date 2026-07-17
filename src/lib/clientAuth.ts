// Client authentication for confidential calls (PAR, /token, /introspect,
// /revoke). Picks the right machinery based on step 2's authMethod:
//
//   none                 → no auth (PKCE-only public client)
//   client_secret_basic  → Authorization: Basic base64(client_id:secret)
//   client_secret_post   → client_id + client_secret in the form body
//   private_key_jwt      → client_assertion JWT signed with the imported JWK
//
// The JWK is re-imported on each call so we never have to store CryptoKey in
// React state. SubtleCrypto import is fast (microseconds).

import { validateAndImportJwk } from "./jwk";
import { signCompactJws } from "./jws";
import { randomBase64Url } from "./random";
import type { ClientConfigState } from "../types";

export interface ApplyAuthOptions {
  client: ClientConfigState;
  audience: string; // e.g. token_endpoint or par_endpoint or issuer
  headers: Headers;
  body: URLSearchParams;
}

export interface AuthApplyResult {
  ok: true;
}

export interface AuthApplyError {
  ok: false;
  message: string;
}

export type AuthApplyOutcome = AuthApplyResult | AuthApplyError;

export async function applyClientAuth(
  opts: ApplyAuthOptions,
): Promise<AuthApplyOutcome> {
  const { client } = opts;
  switch (client.authMethod) {
    case "none":
      // Public client. The body must already include client_id.
      if (!opts.body.has("client_id")) opts.body.set("client_id", client.clientId);
      return { ok: true };

    case "client_secret_basic": {
      if (!client.clientSecret) {
        return { ok: false, message: "client_secret is empty (step 2)." };
      }
      const encoded = btoa(`${client.clientId}:${client.clientSecret}`);
      opts.headers.set("Authorization", `Basic ${encoded}`);
      return { ok: true };
    }

    case "client_secret_post": {
      if (!client.clientSecret) {
        return { ok: false, message: "client_secret is empty (step 2)." };
      }
      opts.body.set("client_id", client.clientId);
      opts.body.set("client_secret", client.clientSecret);
      return { ok: true };
    }

    case "private_key_jwt": {
      const validated = await validateAndImportJwk(client.privateKey.jwkText);
      if (!validated.ok) {
        return {
          ok: false,
          message: `Private key JWK is invalid: ${validated.message}`,
        };
      }
      const jwt = await signClientAssertion({
        clientId: client.clientId,
        audience: opts.audience,
        cryptoKey: validated.cryptoKey,
        alg: validated.alg,
        kid: validated.kid,
      });
      opts.body.set("client_id", client.clientId);
      opts.body.set(
        "client_assertion_type",
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      );
      opts.body.set("client_assertion", jwt);
      return { ok: true };
    }
  }
}

interface SignAssertionOpts {
  clientId: string;
  audience: string;
  cryptoKey: CryptoKey;
  alg: string;
  kid?: string;
}

async function signClientAssertion(opts: SignAssertionOpts): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header: Record<string, string> = { alg: opts.alg, typ: "JWT" };
  if (opts.kid) header.kid = opts.kid;
  const payload = {
    iss: opts.clientId,
    sub: opts.clientId,
    aud: opts.audience,
    iat: now,
    exp: now + 60,
    jti: randomBase64Url(16),
  };
  return signCompactJws({
    header,
    payload,
    cryptoKey: opts.cryptoKey,
    alg: opts.alg,
  });
}
