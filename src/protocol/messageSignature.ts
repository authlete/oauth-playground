// FAPI 2.0 Message Signing (RFC 9421 HTTP Message Signatures).
//
// Two directions, both on `fetch-message-signatures`:
//   Request  — the client signs its call to the resource (Authlete verifies).
//     covers @method @target-uri authorization [dpop] [content-digest],
//     tag "fapi-2-request". Signed with the client's private_key_jwt key, whose
//     public half is already registered with the AS.
//   Response — the client verifies the resource's signed reply.
//     covers the request components (each ;req) + @status + content-digest,
//     tag "fapi-2-response". Verified against the resource's published JWKS.

import {
  createSignature,
  ecdsaP256Sha256Signer,
  ecdsaP256Sha256Verifier,
  getSignatureParameter,
  verify,
  type ComponentIdentifier,
  type SignableRequest,
  type SignableResponse,
  type VerifierFactory,
} from "fetch-message-signatures";
import { validateAndImportJwk } from "./jwk";
import type { Jwks } from "../types";

const FAPI_REQUEST_TAG = "fapi-2-request";

/** RFC 9530 Content-Digest field value (`sha-256=:…:`, standard base64). */
export async function contentDigest(body: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body),
  );
  const b64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return `sha-256=:${b64}:`;
}

export interface RequestSignInput {
  /** Client private_key_jwt JWK (JSON) — its public half is registered with the AS. */
  signingKeyJwk: string;
  method: string;
  url: string;
}

/**
 * Sign an outbound FAPI resource request in place. Content-Digest must already
 * be set when the request has a body, so it is covered. Runs after DPoP so the
 * `dpop` and `authorization` headers are covered too.
 */
export async function applyRequestSignature(
  headers: Headers,
  input: RequestSignInput,
): Promise<void> {
  const key = await validateAndImportJwk(input.signingKeyJwk);
  if (!key.ok) throw new Error(`Signing key is invalid: ${key.message}`);
  if (key.alg !== "ES256") {
    throw new Error(
      `FAPI message signing here expects an ES256 key; the client key is ${key.alg}.`,
    );
  }

  const components: ComponentIdentifier[] = [
    "@method",
    "@target-uri",
    "authorization",
  ];
  if (headers.has("dpop")) components.push("dpop");
  if (headers.has("content-digest")) components.push("content-digest");

  const request: SignableRequest = {
    method: input.method,
    url: input.url,
    headers,
  };
  const fields = await createSignature(request, {
    signer: ecdsaP256Sha256Signer(key.cryptoKey),
    components,
    label: "sig",
    parameters: key.kid
      ? { keyid: key.kid, tag: FAPI_REQUEST_TAG }
      : { tag: FAPI_REQUEST_TAG },
  });
  headers.set("Signature-Input", fields.signatureInput);
  headers.set("Signature", fields.signatureField);
}

export interface ResponseVerifyResult {
  /** Did the response carry a Signature at all? */
  signed: boolean;
  /** Did the signature verify against the resource's JWKS? */
  verified: boolean;
  keyid?: string;
  tag?: string;
  /** Does the response body actually hash to its Content-Digest? */
  digestMatches?: boolean;
  signatureInput?: string;
  reason?: string;
}

/** Verify a resource's signed response against its published JWKS. */
export async function verifyResponseSignature(opts: {
  status: number;
  responseHeaders: Headers;
  bodyText: string;
  /** The exact request that triggered the response, for the `;req` components. */
  request: SignableRequest;
  jwks: Jwks;
}): Promise<ResponseVerifyResult> {
  const signatureInput = opts.responseHeaders.get("signature-input");
  const signature = opts.responseHeaders.get("signature");
  if (!signatureInput || !signature) {
    return {
      signed: false,
      verified: false,
      reason: "The response carried no Signature / Signature-Input.",
    };
  }

  // Independent body-integrity check: a valid signature only proves the
  // Content-Digest it covered, not that the body matches it.
  const contentDigestHeader = opts.responseHeaders.get("content-digest");
  const digestMatches =
    contentDigestHeader === (await contentDigest(opts.bodyText));

  const response: SignableResponse = {
    status: opts.status,
    headers: opts.responseHeaders,
  };
  try {
    const verified = await verify(response, {
      request: opts.request,
      verifier: jwksVerifier(opts.jwks),
      policy: {
        requiredComponents: ["@status", "content-digest"],
        requiredParameters: ["keyid", "created"],
        algorithms: ["ecdsa-p256-sha256"],
      },
    });
    const keyid = getSignatureParameter(verified, "keyid");
    const tag = getSignatureParameter(verified, "tag");
    return {
      signed: true,
      verified: true,
      keyid: typeof keyid === "string" ? keyid : undefined,
      tag: typeof tag === "string" ? tag : undefined,
      digestMatches,
      signatureInput,
    };
  } catch (e) {
    return {
      signed: true,
      verified: false,
      digestMatches,
      signatureInput,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

// Resolves the resource's public verification key by the signature's keyid.
function jwksVerifier(jwks: Jwks): VerifierFactory {
  return async (signature, context) => {
    const kid = getSignatureParameter(signature, "keyid");
    const jwk =
      typeof kid === "string"
        ? jwks.keys.find((k) => k.kid === kid)
        : jwks.keys[0];
    if (!jwk)
      throw new Error(
        `No JWK in the resource's JWKS for keyid ${String(kid)}.`,
      );
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk as JsonWebKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    return ecdsaP256Sha256Verifier(key)(signature, context);
  };
}
