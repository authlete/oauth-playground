// DPoP (RFC 9449) — sender-constrained tokens. The client holds a key pair and
// signs a fresh proof JWT per request (bound to the HTTP method + URI, and to
// the access token once it has one). The AS binds the issued token to the key
// (cnf.jkt = the key's thumbprint); every later call carries a matching proof.
//
// All key material stays in memory (the private JWK lives in store state and is
// re-imported per proof, like the client_assertion key in clientAuth.ts).

import { validateAndImportJwk } from "./jwk";
import { signCompactJws } from "./jws";
import { parseJwt } from "./jwt";
import { base64urlEncode, randomBase64Url } from "./random";

export interface DpopKeyPair {
  /** Private JWK (JSON) — held in state, re-imported to sign each proof. */
  privateJwk: string;
  /** Public JWK (kty/crv/x/y) — embedded in each proof's `jwk` header. */
  publicJwk: JsonWebKey;
  alg: string;
  /** RFC 7638 thumbprint — what the AS records as cnf.jkt. */
  thumbprint: string;
}

/** Generate a fresh DPoP key. ES256 (EC P-256): widely supported and the
 * smallest proof. */
export async function generateDpopKey(): Promise<DpopKeyPair> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const priv = (await crypto.subtle.exportKey(
    "jwk",
    pair.privateKey,
  )) as Record<string, unknown>;
  const publicJwk = ecPublicJwk(priv);
  return {
    privateJwk: JSON.stringify({ ...priv, alg: "ES256" }),
    publicJwk,
    alg: "ES256",
    thumbprint: await jwkThumbprint(publicJwk),
  };
}

export interface DpopProofInput {
  privateJwk: string;
  /** HTTP method of the request the proof is for. */
  htm: string;
  /** Request URI — query and fragment are stripped per §4.2. */
  htu: string;
  /** Present it when the request carries an access token: adds `ath`. */
  accessToken?: string;
  /** A server-supplied DPoP-Nonce, echoed back when challenged (§8). */
  nonce?: string;
}

/** Build a signed DPoP proof JWT for one request. */
export async function createDpopProof(input: DpopProofInput): Promise<string> {
  const key = await validateAndImportJwk(input.privateJwk);
  if (!key.ok) throw new Error(`DPoP key is invalid: ${key.message}`);
  const publicJwk = ecPublicJwk(JSON.parse(input.privateJwk));

  const payload: Record<string, unknown> = {
    jti: randomBase64Url(16),
    htm: input.htm,
    htu: dpopHtu(input.htu),
    iat: Math.floor(Date.now() / 1000),
  };
  if (input.accessToken) payload.ath = await sha256Base64Url(input.accessToken);
  if (input.nonce) payload.nonce = input.nonce;

  return signCompactJws({
    header: { typ: "dpop+jwt", alg: key.alg, jwk: publicJwk },
    payload,
    cryptoKey: key.cryptoKey,
    alg: key.alg,
  });
}

/** Per-session DPoP state a request needs: the key, and the last nonce. */
export interface DpopContext {
  privateJwk: string;
  nonce?: string;
}

/** Build the request-time DPoP context from store state, or undefined when DPoP
 * is off — so callers pass `dpopContextFrom(state.dpop)` without branching. */
export function dpopContextFrom(dpop: {
  enabled: boolean;
  privateJwk: string;
  nonce?: string;
}): DpopContext | undefined {
  return dpop.enabled
    ? { privateJwk: dpop.privateJwk, nonce: dpop.nonce }
    : undefined;
}

/** Set the DPoP proof header for a request; when the request carries an access
 * token, also switch Authorization to the DPoP scheme (§7.1). */
export async function applyDpopProof(
  headers: Headers,
  ctx: DpopContext,
  req: { method: string; url: string; accessToken?: string },
): Promise<void> {
  headers.set(
    "DPoP",
    await createDpopProof({
      privateJwk: ctx.privateJwk,
      htm: req.method,
      htu: req.url,
      accessToken: req.accessToken,
      nonce: ctx.nonce,
    }),
  );
  if (req.accessToken) headers.set("Authorization", `DPoP ${req.accessToken}`);
}

/** RFC 7638 JWK thumbprint — the value the AS stores as cnf.jkt. The canonical
 * form uses only the required members, in lexicographic order. */
export async function jwkThumbprint(jwk: JsonWebKey): Promise<string> {
  const canonical =
    jwk.kty === "EC"
      ? { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }
      : { e: jwk.e, kty: jwk.kty, n: jwk.n };
  return sha256Base64Url(JSON.stringify(canonical));
}

/** The cnf.jkt (§6) the AS bound into a JWT access token, if present. A match
 * with the client key's thumbprint is visible proof the token is sender-
 * constrained. Opaque tokens carry the same binding but don't expose it here. */
export function accessTokenJkt(accessToken: string): string | undefined {
  const parsed = parseJwt(accessToken);
  if (!parsed.ok) return undefined;
  const cnf = parsed.jwt.payload.cnf;
  if (cnf && typeof cnf === "object") {
    const jkt = (cnf as Record<string, unknown>).jkt;
    if (typeof jkt === "string") return jkt;
  }
  return undefined;
}

/** The htu claim: scheme + host + path, without query or fragment (§4.2). */
export function dpopHtu(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

/** Is a response a DPoP-Nonce challenge (§8)? If so, callers retry with the
 * nonce from the DPoP-Nonce header. */
export function dpopNonceChallenge(
  status: number,
  errorCode: string | undefined,
  dpopNonceHeader: string | null,
): string | undefined {
  if (!dpopNonceHeader) return undefined;
  if (errorCode === "use_dpop_nonce" || status === 400 || status === 401) {
    return dpopNonceHeader;
  }
  return undefined;
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return base64urlEncode(new Uint8Array(digest));
}

function ecPublicJwk(jwk: Record<string, unknown>): JsonWebKey {
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } as JsonWebKey;
}
