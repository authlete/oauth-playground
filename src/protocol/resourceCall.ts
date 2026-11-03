// A tiny generic HTTP client for hitting a user-owned resource server.
// Out of scope: any AS interaction. The OAuth-y bit is the optional "Attach
// token" toggle that presents the access_token — as DPoP (RFC 9449 §7.1, with
// a token-bound proof) when DPoP is on, otherwise Bearer.

import { send } from "./dpopHttp";
import type { DpopContext } from "./dpop";
import {
  applyRequestSignature,
  contentDigest,
  verifyResponseSignature,
} from "./messageSignature";
import type {
  HttpMethod,
  Jwks,
  NetworkEntry,
  SignatureVerification,
} from "../types";

export interface ResourceCallInput {
  url: string;
  method: HttpMethod;
  headersText: string;
  bodyText: string;
  attachBearer: boolean;
  accessToken?: string;
  dpop?: DpopContext;
  onDpopNonce?: (nonce: string) => void;
  /** Sign the outbound request (FAPI 2.0) with the client's private_key_jwt key. */
  requestSigning?: { signingKeyJwk: string };
  /** Verify the resource's signed response against its JWKS. */
  responseVerify?: { jwksUri: string };
  onStart: (entry: NetworkEntry) => void;
  onFinish: (id: string, patch: Partial<NetworkEntry>) => void;
}

export type ResourceCallResult =
  | {
      ok: true;
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
      durationMs: number;
      signatureVerification?: SignatureVerification;
    }
  | { ok: false; message: string };

const ALLOWED_METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
];

export async function resourceCall(
  input: ResourceCallInput,
): Promise<ResourceCallResult> {
  if (!ALLOWED_METHODS.includes(input.method)) {
    return { ok: false, message: `Method not supported: ${input.method}` };
  }
  const trimmedUrl = input.url.trim();
  if (!trimmedUrl) return { ok: false, message: "URL is empty." };
  try {
    const u = new URL(trimmedUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { ok: false, message: "URL must be http(s)." };
    }
  } catch {
    return { ok: false, message: "URL is malformed." };
  }

  const headers = new Headers();
  if (input.headersText.trim()) {
    try {
      const obj = JSON.parse(input.headersText) as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string") headers.set(k, v);
      }
    } catch {
      return {
        ok: false,
        message: "Custom headers must be a JSON object of string values.",
      };
    }
  }
  if (
    input.attachBearer &&
    input.accessToken &&
    !headers.has("Authorization")
  ) {
    headers.set("Authorization", `Bearer ${input.accessToken}`);
  }

  let bodyText: string | undefined;
  if (input.method !== "GET" && input.method !== "HEAD" && input.bodyText) {
    bodyText = input.bodyText;
    if (!headers.has("Content-Type")) {
      // Best-effort content-type detection.
      const trimmed = input.bodyText.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        headers.set("Content-Type", "application/json");
      } else if (trimmed.includes("=") && !trimmed.includes(" ")) {
        headers.set("Content-Type", "application/x-www-form-urlencoded");
      }
    }
  }

  // DPoP only applies when we're presenting the token: the proof binds to it.
  const useDpop = input.dpop && input.attachBearer && input.accessToken;
  // Sign the request after DPoP so the signature covers the dpop/authorization
  // headers; Content-Digest must be present when there's a body.
  const signRequest = input.requestSigning
    ? async (h: Headers) => {
        if (bodyText) h.set("Content-Digest", await contentDigest(bodyText));
        await applyRequestSignature(h, {
          signingKeyJwk: input.requestSigning!.signingKeyJwk,
          method: input.method,
          url: trimmedUrl,
        });
      }
    : undefined;
  const startedAt = performance.now();
  const sent = await send({
    method: input.method,
    url: trimmedUrl,
    headers,
    body: bodyText,
    dpop: useDpop
      ? {
          ctx: input.dpop!,
          accessToken: input.accessToken,
          onNonce: input.onDpopNonce,
        }
      : undefined,
    signRequest,
    onStart: input.onStart,
    onFinish: input.onFinish,
    networkErrorMessage: (err) =>
      err instanceof TypeError
        ? "CORS / network error reaching the resource."
        : err instanceof Error
          ? err.message
          : String(err),
  });
  if (!sent.ok) return { ok: false, message: sent.message };
  const { response, bodyText: body, requestHeaders } = sent;
  const durationMs = Math.round(performance.now() - startedAt);
  const respHeaders: Record<string, string> = {};
  response.headers.forEach((v, k) => {
    respHeaders[k] = v;
  });

  let signatureVerification: SignatureVerification | undefined;
  if (input.responseVerify) {
    signatureVerification = await runResponseVerify({
      jwksUri: input.responseVerify.jwksUri,
      status: response.status,
      responseHeaders: response.headers,
      bodyText: body,
      method: input.method,
      url: trimmedUrl,
      requestHeaders,
    });
  }

  return {
    ok: true,
    status: response.status,
    statusText: response.statusText,
    headers: respHeaders,
    body,
    durationMs,
    signatureVerification,
  };
}

// Fetch the resource's JWKS and verify the response signature. A response with
// no signature short-circuits before the JWKS is fetched.
async function runResponseVerify(opts: {
  jwksUri: string;
  status: number;
  responseHeaders: Headers;
  bodyText: string;
  method: HttpMethod;
  url: string;
  requestHeaders: Headers;
}): Promise<SignatureVerification> {
  if (!opts.responseHeaders.has("signature")) {
    return {
      signed: false,
      verified: false,
      reason: "The response carried no Signature.",
    };
  }
  let jwks: Jwks;
  try {
    const res = await fetch(opts.jwksUri, {
      mode: "cors",
      credentials: "omit",
    });
    if (!res.ok) {
      return {
        signed: true,
        verified: false,
        reason: `Could not fetch the resource JWKS (HTTP ${res.status}).`,
      };
    }
    jwks = (await res.json()) as Jwks;
  } catch (e) {
    return {
      signed: true,
      verified: false,
      reason: `Could not fetch the resource JWKS: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  return verifyResponseSignature({
    status: opts.status,
    responseHeaders: opts.responseHeaders,
    bodyText: opts.bodyText,
    request: {
      method: opts.method,
      url: opts.url,
      headers: opts.requestHeaders,
    },
    jwks,
  });
}
