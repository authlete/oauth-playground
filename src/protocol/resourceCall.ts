// A tiny generic HTTP client for hitting a user-owned resource server.
// Out of scope: any AS interaction. The OAuth-y bit is the optional "Attach
// token" toggle that presents the access_token — as DPoP (RFC 9449 §7.1, with
// a token-bound proof) when DPoP is on, otherwise Bearer.

import { send } from "./dpopHttp";
import type { DpopContext } from "./dpop";
import type { HttpMethod, NetworkEntry } from "../types";

export interface ResourceCallInput {
  url: string;
  method: HttpMethod;
  headersText: string;
  bodyText: string;
  attachBearer: boolean;
  accessToken?: string;
  dpop?: DpopContext;
  onDpopNonce?: (nonce: string) => void;
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
  const { response, bodyText: body } = sent;
  const durationMs = Math.round(performance.now() - startedAt);
  const respHeaders: Record<string, string> = {};
  response.headers.forEach((v, k) => {
    respHeaders[k] = v;
  });
  return {
    ok: true,
    status: response.status,
    statusText: response.statusText,
    headers: respHeaders,
    body,
    durationMs,
  };
}
