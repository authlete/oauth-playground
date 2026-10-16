// DPoP (RFC 9449) — what a sender-constrained client puts on the wire: the
// proof JWT's shape, the key thumbprint, the DPoP Authorization scheme for
// resource calls, and the one-shot nonce retry. Each test pins one MUST.

import { describe, expect, test } from "vitest";
import {
  applyDpopProof,
  createDpopProof,
  dpopHtu,
  generateDpopKey,
  jwkThumbprint,
} from "../../src/protocol/dpop";
import { send } from "../../src/protocol/dpopHttp";
import { parseJwt } from "../../src/protocol/jwt";
import { base64urlEncode } from "../../src/protocol/random";

const noop = () => {};

/** base64url(SHA-256(value)) — the protocol's own ath/jkt digest. */
async function sha256Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return base64urlEncode(new Uint8Array(digest));
}

/** Generate a usable key once; signing needs a real importable key. */
async function freshKey() {
  return generateDpopKey();
}

describe("DPoP proof JWT (RFC 9449 §4.2)", () => {
  test("dpop.proof-typ: header sets typ=dpop+jwt and embeds the public jwk", async () => {
    const key = await freshKey();
    const proof = await createDpopProof({
      privateJwk: key.privateJwk,
      htm: "POST",
      htu: "https://as/token",
    });
    const parsed = parseJwt(proof);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.jwt.header.typ).toBe("dpop+jwt");
    const jwk = parsed.jwt.header.jwk as Record<string, unknown>;
    expect(jwk.kty).toBe("EC");
    expect(jwk.crv).toBe("P-256");
    expect(jwk.x).toBeTypeOf("string");
    // A proof MUST NOT leak the private key.
    expect(jwk.d).toBeUndefined();
  });

  test("dpop.proof-claims: payload carries jti, htm and iat", async () => {
    const key = await freshKey();
    const proof = await createDpopProof({
      privateJwk: key.privateJwk,
      htm: "POST",
      htu: "https://as/token",
    });
    const parsed = parseJwt(proof);
    if (!parsed.ok) throw new Error("proof did not parse");
    const p = parsed.jwt.payload;
    expect(p.htm).toBe("POST");
    expect(typeof p.jti).toBe("string");
    expect((p.jti as string).length).toBeGreaterThan(10);
    expect(typeof p.iat).toBe("number");
  });

  test("dpop.htu-canonical: htu drops query and fragment", async () => {
    expect(dpopHtu("https://as/token?foo=1#frag")).toBe("https://as/token");
    const key = await freshKey();
    const proof = await createDpopProof({
      privateJwk: key.privateJwk,
      htm: "GET",
      htu: "https://rs/resource?a=b&c=d",
    });
    const parsed = parseJwt(proof);
    if (!parsed.ok) throw new Error("proof did not parse");
    expect(parsed.jwt.payload.htu).toBe("https://rs/resource");
  });
});

describe("DPoP key thumbprint (RFC 7638 §3)", () => {
  test("dpop.thumbprint: canonical over required members only, lexicographic", async () => {
    const publicJwk = { kty: "EC", crv: "P-256", x: "AA", y: "BB" };
    // Pinned to the exact RFC 7638 canonical form: required EC members, in
    // lexicographic order, no whitespace. Catches reordering/extra-member bugs.
    const canonical = '{"crv":"P-256","kty":"EC","x":"AA","y":"BB"}';
    const expected = await sha256Url(canonical);
    expect(await jwkThumbprint(publicJwk as JsonWebKey)).toBe(expected);
    // Extra members (d, alg, kid) and member order MUST NOT change the result.
    const noisy = {
      kid: "ignored",
      y: "BB",
      d: "secret",
      alg: "ES256",
      x: "AA",
      crv: "P-256",
      kty: "EC",
    };
    expect(await jwkThumbprint(noisy as JsonWebKey)).toBe(expected);
    // generateDpopKey reports the thumbprint of its own public key.
    const key = await generateDpopKey();
    expect(key.thumbprint).toBe(await jwkThumbprint(key.publicJwk));
  });
});

describe("DPoP Authorization (RFC 9449 §5, §7.1)", () => {
  test("dpop.token-header: applying a proof sets a DPoP header bound to the request", async () => {
    const key = await freshKey();
    const headers = new Headers({ "Content-Type": "application/json" });
    await applyDpopProof(
      headers,
      { privateJwk: key.privateJwk },
      { method: "POST", url: "https://as/token" },
    );
    const proof = headers.get("DPoP");
    expect(proof).toBeTruthy();
    const parsed = parseJwt(proof!);
    if (!parsed.ok) throw new Error("proof did not parse");
    expect(parsed.jwt.payload.htm).toBe("POST");
    expect(parsed.jwt.payload.htu).toBe("https://as/token");
    // No access token on a plain token request → no ath.
    expect(parsed.jwt.payload.ath).toBeUndefined();
  });

  test("dpop.resource-ath: token-bearing request uses DPoP scheme with ath", async () => {
    const key = await freshKey();
    const headers = new Headers();
    await applyDpopProof(
      headers,
      { privateJwk: key.privateJwk },
      { method: "GET", url: "https://rs/userinfo", accessToken: "at-xyz" },
    );
    expect(headers.get("Authorization")).toBe("DPoP at-xyz");
    const parsed = parseJwt(headers.get("DPoP")!);
    if (!parsed.ok) throw new Error("proof did not parse");
    expect(parsed.jwt.payload.ath).toBe(await sha256Url("at-xyz"));
  });
});

describe("DPoP nonce (RFC 9449 §8)", () => {
  test("dpop.nonce-retry: use_dpop_nonce challenge → one retry echoing the nonce", async () => {
    const key = await freshKey();
    const proofs: string[] = [];
    let call = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: RequestInit = {}) => {
      proofs.push(new Headers(init.headers).get("DPoP") ?? "");
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify({ error: "use_dpop_nonce" }), {
          status: 400,
          headers: { "DPoP-Nonce": "nonce-123" },
        });
      }
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    let storedNonce: string | undefined;
    try {
      const result = await send({
        method: "POST",
        url: "https://as/token",
        headers: new Headers({ "Content-Type": "application/json" }),
        body: "grant_type=authorization_code",
        dpop: {
          ctx: { privateJwk: key.privateJwk },
          onNonce: (n) => (storedNonce = n),
        },
        onStart: noop,
        onFinish: noop,
      });
      expect(result.ok).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
    }
    // Two attempts: the challenge, then the retry.
    expect(call).toBe(2);
    expect(storedNonce).toBe("nonce-123");
    // The first proof has no nonce; the retry echoes the server's.
    const first = parseJwt(proofs[0]);
    const second = parseJwt(proofs[1]);
    if (!first.ok || !second.ok) throw new Error("proof did not parse");
    expect(first.jwt.payload.nonce).toBeUndefined();
    expect(second.jwt.payload.nonce).toBe("nonce-123");
  });
});
