// Step 5 popup orchestration: open the AS in a new tab, listen for the
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

export function listenForCallback(opts: AuthorizeListenerOptions): () => void {
  let fired = false;

  const fire = (
    source: "postMessage" | "storage",
    params: CallbackParams,
  ) => {
    if (fired) return;
    fired = true;
    opts.onResult({
      source,
      params,
      stateMatches: params.state === opts.expectedState,
      issMatches: opts.expectedIssuer
        ? params.iss === opts.expectedIssuer
        : undefined,
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
