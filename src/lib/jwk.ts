// JWK validation + import for client_assertion (private_key_jwt) signing.
//
// We only need PRIVATE keys here (the client's signing key). Supported algs
// for v0.1 cover the common AS deployments: ES256/384/512, RS256/384/512,
// PS256/384/512. The CryptoKey lives in memory only (§8 — never persisted).

interface JwkLike {
  kty?: string;
  kid?: string;
  alg?: string;
  crv?: string;
  d?: string;
  n?: string;
  use?: string;
}

export interface JwkValidateOk {
  ok: true;
  alg: string;
  kid?: string;
  cryptoKey: CryptoKey;
  jwk: JwkLike;
}

export interface JwkValidateErr {
  ok: false;
  message: string;
}

export type JwkValidateResult = JwkValidateOk | JwkValidateErr;

const EC_ALG_BY_CURVE: Record<string, string> = {
  "P-256": "ES256",
  "P-384": "ES384",
  "P-521": "ES512",
};

const SUPPORTED_ALGS = new Set([
  "ES256",
  "ES384",
  "ES512",
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
]);

function algToSubtleParams(alg: string): {
  importAlgorithm: AlgorithmIdentifier | EcKeyImportParams | RsaHashedImportParams;
} | null {
  switch (alg) {
    case "ES256":
      return { importAlgorithm: { name: "ECDSA", namedCurve: "P-256" } };
    case "ES384":
      return { importAlgorithm: { name: "ECDSA", namedCurve: "P-384" } };
    case "ES512":
      return { importAlgorithm: { name: "ECDSA", namedCurve: "P-521" } };
    case "RS256":
      return {
        importAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      };
    case "RS384":
      return {
        importAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-384" },
      };
    case "RS512":
      return {
        importAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" },
      };
    case "PS256":
      return { importAlgorithm: { name: "RSA-PSS", hash: "SHA-256" } };
    case "PS384":
      return { importAlgorithm: { name: "RSA-PSS", hash: "SHA-384" } };
    case "PS512":
      return { importAlgorithm: { name: "RSA-PSS", hash: "SHA-512" } };
    default:
      return null;
  }
}

function deriveAlg(jwk: JwkLike): string | null {
  if (typeof jwk.alg === "string" && SUPPORTED_ALGS.has(jwk.alg)) return jwk.alg;
  if (jwk.kty === "EC" && typeof jwk.crv === "string") {
    return EC_ALG_BY_CURVE[jwk.crv] ?? null;
  }
  if (jwk.kty === "RSA") return "RS256";
  return null;
}

export async function validateAndImportJwk(
  raw: string,
): Promise<JwkValidateResult> {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, message: "Paste a JWK in JSON form." };

  let jwk: JwkLike;
  try {
    jwk = JSON.parse(trimmed) as JwkLike;
  } catch (e) {
    return {
      ok: false,
      message: `JWK is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (typeof jwk !== "object" || jwk === null) {
    return { ok: false, message: "JWK must be a JSON object." };
  }
  if (typeof jwk.kty !== "string") {
    return { ok: false, message: "JWK is missing required field `kty`." };
  }
  if (typeof jwk.d !== "string") {
    return {
      ok: false,
      message:
        "JWK doesn't appear to be a PRIVATE key. Missing field `d` (the private component).",
    };
  }

  const alg = deriveAlg(jwk);
  if (!alg) {
    return {
      ok: false,
      message: `Unsupported JWK. Set \`alg\` to one of: ${[...SUPPORTED_ALGS].join(", ")}.`,
    };
  }
  const params = algToSubtleParams(alg);
  if (!params) {
    return { ok: false, message: `Unsupported alg: ${alg}` };
  }

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      "jwk",
      jwk as JsonWebKey,
      params.importAlgorithm,
      false,
      ["sign"],
    );
  } catch (e) {
    return {
      ok: false,
      message: `Web Crypto rejected the JWK: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  return {
    ok: true,
    alg,
    kid: typeof jwk.kid === "string" ? jwk.kid : undefined,
    cryptoKey,
    jwk,
  };
}
