// Authorize popup orchestration: open the AS in a new tab, listen for the
// CallbackPage to post the result back. The popup loses opener access if the
// AS sends a COOP header, so we listen on TWO channels and use whichever
// fires first: postMessage (best case) or localStorage events (fallback).

import {
  CALLBACK_MESSAGE_TYPE,
  CALLBACK_STORAGE_KEY,
  type CallbackParams,
} from "./callback";

export interface AuthorizeListenerOptions {
  expectedState: string;
  expectedIssuer?: string;
  onResult: (event: AuthorizeCallbackEvent) => void;
}

export interface AuthorizeCallbackEvent {
  source: "postMessage" | "storage";
  params: CallbackParams;
  stateMatches: boolean;
  issMatches?: boolean;
}

/** The two anti-CSRF / mix-up checks on the callback, as pure comparisons:
 * `state` must echo what we sent (RFC 6749 §10.12), and `iss` must match the
 * AS issuer when present (RFC 9207). Extracted so both the live listener and
 * the conformance tests exercise the same logic. */
export function evaluateCallback(
  params: CallbackParams,
  expectedState: string,
  expectedIssuer?: string,
): { stateMatches: boolean; issMatches?: boolean } {
  return {
    stateMatches: params.state === expectedState,
    issMatches: expectedIssuer ? params.iss === expectedIssuer : undefined,
  };
}

export function listenForCallback(opts: AuthorizeListenerOptions): () => void {
  let fired = false;

  const fire = (source: "postMessage" | "storage", params: CallbackParams) => {
    if (fired) return;
    fired = true;
    opts.onResult({
      source,
      params,
      ...evaluateCallback(params, opts.expectedState, opts.expectedIssuer),
    });
  };

  const onMessage = (e: MessageEvent) => {
    if (e.origin !== window.location.origin) return;
    const data = e.data as { type?: string } & CallbackParams;
    if (data?.type !== CALLBACK_MESSAGE_TYPE) return;
    fire("postMessage", data);
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== CALLBACK_STORAGE_KEY || !e.newValue) return;
    try {
      const params = JSON.parse(e.newValue) as CallbackParams;
      fire("storage", params);
    } catch {
      // ignore
    }
  };

  window.addEventListener("message", onMessage);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener("message", onMessage);
    window.removeEventListener("storage", onStorage);
  };
}

export function openAuthorizeTab(url: string): Window | null {
  // No noopener — we want the CallbackPage to be able to call
  // window.opener.postMessage. Since the popup is same-origin (the callback
  // page is at this playground's origin), this is safe.
  return window.open(url, "_blank");
}
