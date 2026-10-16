// Shared request transport: logging + optional DPoP. Centralised so every
// endpoint applies a proof the same way and the DPoP-Nonce retry (§8) is
// handled (and logged) once rather than copied into each caller.

import type { HttpMethod, NetworkEntry } from "../types";
import { applyDpopProof, type DpopContext } from "./dpop";

export interface DpopSend {
  ctx: DpopContext;
  /** Set for requests that present an access token — adds `ath` and switches
   * Authorization to the DPoP scheme. */
  accessToken?: string;
  /** Persist a fresh DPoP-Nonce the server returned. */
  onNonce?: (nonce: string) => void;
}

export interface SendInput {
  method: HttpMethod;
  url: string;
  headers: Headers;
  body?: string;
  dpop?: DpopSend;
  onStart: (entry: NetworkEntry) => void;
  onFinish: (id: string, patch: Partial<NetworkEntry>) => void;
  /** Per-endpoint message when fetch throws (e.g. a CORS hint). */
  networkErrorMessage?: (err: unknown) => string;
}

export type SendResult =
  | { ok: true; response: Response; bodyText: string }
  | { ok: false; message: string };

export async function send(input: SendInput): Promise<SendResult> {
  const attempt = async (nonce?: string): Promise<SendResult> => {
    if (input.dpop) {
      await applyDpopProof(
        input.headers,
        { ...input.dpop.ctx, nonce },
        {
          method: input.method,
          url: input.url,
          accessToken: input.dpop.accessToken,
        },
      );
    }
    const id = crypto.randomUUID();
    const startedAt = performance.now();
    input.onStart({
      id,
      startedAt,
      method: input.method,
      url: input.url,
      requestHeaders: Object.fromEntries(input.headers.entries()),
      requestBody: input.body,
    });
    let response: Response;
    try {
      response = await fetch(input.url, {
        method: input.method,
        mode: "cors",
        credentials: "omit",
        headers: input.headers,
        body: input.body,
      });
    } catch (err) {
      const finishedAt = performance.now();
      const message =
        input.networkErrorMessage?.(err) ??
        (err instanceof Error ? err.message : String(err));
      input.onFinish(id, {
        finishedAt,
        durationMs: Math.round(finishedAt - startedAt),
        errorMessage: message,
      });
      return { ok: false, message };
    }
    const bodyText = await response.text();
    const finishedAt = performance.now();
    const respHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      respHeaders[k] = v;
    });
    input.onFinish(id, {
      finishedAt,
      durationMs: Math.round(finishedAt - startedAt),
      status: response.status,
      statusText: response.statusText,
      responseHeaders: respHeaders,
      responseBody: bodyText,
    });
    return { ok: true, response, bodyText };
  };

  let result = await attempt(input.dpop?.ctx.nonce);
  if (result.ok && input.dpop) {
    const nonce = result.response.headers.get("DPoP-Nonce");
    if (nonce) {
      input.dpop.onNonce?.(nonce);
      const challenged =
        (result.response.status === 400 || result.response.status === 401) &&
        /use_dpop_nonce/.test(result.bodyText);
      if (challenged) result = await attempt(nonce);
    }
  }
  return result;
}
