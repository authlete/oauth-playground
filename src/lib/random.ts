// Base64url-encoded cryptographic random — used for `state`, `nonce`, and the
// PKCE `code_verifier`. All values stay in memory (§8). The default 16-byte
// length yields ~22 base64url chars, enough for state/nonce; the verifier
// uses 32 bytes per RFC 7636 §4.1 recommendations.

export function randomBase64Url(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes);
}

export function base64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
