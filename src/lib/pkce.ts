// PKCE (RFC 7636) — only S256 in v0.1; plain is allowed by spec but actively
// discouraged. The verifier is high-entropy random base64url; the challenge
// is base64url(SHA-256(verifier)).

import { base64urlEncode, randomBase64Url } from "./random";

export function generateCodeVerifier(): string {
  // 32 random bytes → 43 base64url chars. Spec minimum is 43, max 128.
  return randomBase64Url(32);
}

export async function computeCodeChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return base64urlEncode(new Uint8Array(digest));
}
