// Compact JWS (RFC 7515) signing, shared by client_assertion (private_key_jwt,
// see clientAuth.ts) and JAR request objects (see requestObject.ts). Web Crypto
// only; the CryptoKey is imported per call by the caller and never persisted (§8).

import { base64urlEncode } from "./random";

export function jwsSignParams(
  alg: string,
): AlgorithmIdentifier | EcdsaParams | RsaPssParams {
  switch (alg) {
    case "ES256":
      return { name: "ECDSA", hash: "SHA-256" };
    case "ES384":
      return { name: "ECDSA", hash: "SHA-384" };
    case "ES512":
      return { name: "ECDSA", hash: "SHA-512" };
    case "RS256":
    case "RS384":
    case "RS512":
      return { name: "RSASSA-PKCS1-v1_5" };
    case "PS256":
      return { name: "RSA-PSS", saltLength: 32 };
    case "PS384":
      return { name: "RSA-PSS", saltLength: 48 };
    case "PS512":
      return { name: "RSA-PSS", saltLength: 64 };
    default:
      throw new Error(`Unsupported alg for signing: ${alg}`);
  }
}

export interface SignCompactJwsOpts {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  cryptoKey: CryptoKey;
  alg: string;
}

export async function signCompactJws(opts: SignCompactJwsOpts): Promise<string> {
  const headerB64 = base64urlEncode(
    new TextEncoder().encode(JSON.stringify(opts.header)),
  );
  const payloadB64 = base64urlEncode(
    new TextEncoder().encode(JSON.stringify(opts.payload)),
  );
  const signingInput = `${headerB64}.${payloadB64}`;
  const sigBytes = await crypto.subtle.sign(
    jwsSignParams(opts.alg),
    opts.cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64urlEncode(new Uint8Array(sigBytes))}`;
}
