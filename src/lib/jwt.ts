// JWT parse + verify (RFC 7519, signatures per RFC 7515).
//
// Verification uses Web Crypto against the JWKS loaded by step 1. Symmetric
// algs (HS256/384/512) are intentionally excluded — they need a shared secret
// the client shouldn't have for OIDC at-rest tokens.

import type { Jwks } from "../types";

export interface JwtParsed {
  raw: string;
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string; // base64url
  signingInput: string; // header.payload
}

export type JwtParseResult =
  | { ok: true; jwt: JwtParsed }
  | { ok: false; reason: string };

export function parseJwt(raw: string): JwtParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "Empty input." };
  const parts = trimmed.split(".");
  if (parts.length !== 3) {
    return {
      ok: false,
      reason: `Not a JWT — got ${parts.length} dot-separated segment${parts.length === 1 ? "" : "s"}, expected 3.`,
    };
  }
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(base64urlDecodeText(parts[0])) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "Header is not valid base64url-encoded JSON." };
  }
  try {
    payload = JSON.parse(base64urlDecodeText(parts[1])) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "Payload is not valid base64url-encoded JSON." };
  }
  return {
    ok: true,
    jwt: {
      raw: trimmed,
      header,
      payload,
      signature: parts[2],
      signingInput: `${parts[0]}.${parts[1]}`,
    },
  };
}

export interface JwtVerifyOk {
  ok: true;
  alg: string;
  kid?: string;
}

export interface JwtVerifyErr {
  ok: false;
  reason: string;
}

export type JwtVerifyResult = JwtVerifyOk | JwtVerifyErr;

export async function verifyJwt(
  jwt: JwtParsed,
  jwks: Jwks | undefined,
): Promise<JwtVerifyResult> {
  const alg = typeof jwt.header.alg === "string" ? jwt.header.alg : undefined;
  if (!alg) return { ok: false, reason: "Header has no `alg`." };
  if (alg === "none") return { ok: false, reason: "alg=none refused." };
  if (!jwks?.keys?.length) {
    return { ok: false, reason: "No JWKS loaded — run Discovery first." };
  }

  const kid = typeof jwt.header.kid === "string" ? jwt.header.kid : undefined;
  const candidates = jwks.keys.filter((k) => {
    if (kid && k.kid && k.kid !== kid) return false;
    return matchesAlg(k, alg);
  });
  if (candidates.length === 0) {
    return {
      ok: false,
      reason: kid
        ? `No key in JWKS with kid=${kid} and matching alg=${alg}.`
        : `No key in JWKS matches alg=${alg}.`,
    };
  }

  const importParams = importAlgParams(alg);
  if (!importParams) {
    return { ok: false, reason: `Unsupported alg: ${alg}` };
  }
  const verifyParams = verifyAlgParams(alg);
  if (!verifyParams) {
    return { ok: false, reason: `Unsupported alg: ${alg}` };
  }

  const signatureBytes = base64urlDecode(jwt.signature);
  const dataBytes = new TextEncoder().encode(jwt.signingInput);

  for (const key of candidates) {
    let cryptoKey: CryptoKey;
    try {
      cryptoKey = await crypto.subtle.importKey(
        "jwk",
        key as JsonWebKey,
        importParams,
        false,
        ["verify"],
      );
    } catch {
      continue;
    }
    try {
      const ok = await crypto.subtle.verify(
        verifyParams,
        cryptoKey,
        signatureBytes as BufferSource,
        dataBytes as BufferSource,
      );
      if (ok) {
        return {
          ok: true,
          alg,
          kid: typeof key.kid === "string" ? key.kid : undefined,
        };
      }
    } catch {
      continue;
    }
  }
  return {
    ok: false,
    reason: `Signature did not verify against ${candidates.length} candidate key${candidates.length === 1 ? "" : "s"}.`,
  };
}

function matchesAlg(key: Record<string, unknown>, alg: string): boolean {
  if (typeof key.alg === "string" && key.alg === alg) return true;
  const kty = key.kty;
  if (alg.startsWith("RS") || alg.startsWith("PS")) return kty === "RSA";
  if (alg.startsWith("ES")) {
    if (kty !== "EC") return false;
    const expectedCrv: Record<string, string> = {
      ES256: "P-256",
      ES384: "P-384",
      ES512: "P-521",
    };
    return (
      typeof key.crv === "string" &&
      key.crv === expectedCrv[alg as keyof typeof expectedCrv]
    );
  }
  return false;
}

function importAlgParams(
  alg: string,
):
  | AlgorithmIdentifier
  | EcKeyImportParams
  | RsaHashedImportParams
  | null {
  switch (alg) {
    case "ES256":
      return { name: "ECDSA", namedCurve: "P-256" };
    case "ES384":
      return { name: "ECDSA", namedCurve: "P-384" };
    case "ES512":
      return { name: "ECDSA", namedCurve: "P-521" };
    case "RS256":
      return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    case "RS384":
      return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-384" };
    case "RS512":
      return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" };
    case "PS256":
      return { name: "RSA-PSS", hash: "SHA-256" };
    case "PS384":
      return { name: "RSA-PSS", hash: "SHA-384" };
    case "PS512":
      return { name: "RSA-PSS", hash: "SHA-512" };
    default:
      return null;
  }
}

function verifyAlgParams(
  alg: string,
): AlgorithmIdentifier | EcdsaParams | RsaPssParams | null {
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
      return null;
  }
}

export function base64urlDecode(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function base64urlDecodeText(input: string): string {
  return new TextDecoder().decode(base64urlDecode(input));
}

export function looksLikeJwt(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  const parts = t.split(".");
  if (parts.length !== 3) return false;
  return parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p));
}

export interface JwtTimings {
  iatAt?: number;
  expAt?: number;
  nbfAt?: number;
  secondsToExpiry?: number;
  expired?: boolean;
}

export function computeJwtTimings(
  payload: Record<string, unknown>,
  nowMs: number = Date.now(),
): JwtTimings {
  const iat = numericClaim(payload.iat);
  const exp = numericClaim(payload.exp);
  const nbf = numericClaim(payload.nbf);
  const out: JwtTimings = {
    iatAt: iat ? iat * 1000 : undefined,
    expAt: exp ? exp * 1000 : undefined,
    nbfAt: nbf ? nbf * 1000 : undefined,
  };
  if (exp) {
    out.secondsToExpiry = Math.round(exp - nowMs / 1000);
    out.expired = out.secondsToExpiry <= 0;
  }
  return out;
}

function numericClaim(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
