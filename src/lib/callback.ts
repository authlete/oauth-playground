// Callback handling — the AS redirects the user back to ${redirect_uri}
// with code/state/iss (success) or error/error_description (failure).
//
// The playground's redirect_uri is `${origin}/callback`. The CallbackPage
// shown at that path posts the result back to the playground tab via
// postMessage AND localStorage; the main tab listens for both. Per §13 q3
// of the design, this is just SPA fragment routing — no server handler.

export interface CallbackParams {
  code?: string;
  state?: string;
  iss?: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
  raw: string;
  receivedAt: number;
}

export const CALLBACK_STORAGE_KEY = "playground.callback.last";
export const CALLBACK_MESSAGE_TYPE = "playground:callback";

export function parseCallbackUrl(url: string): CallbackParams {
  const u = new URL(url);
  const query = u.searchParams;
  // Some flows return params in the fragment (response_mode=fragment).
  const fragmentParams = u.hash ? new URLSearchParams(u.hash.replace(/^#/, "")) : null;
  const get = (k: string): string | undefined =>
    query.get(k) ?? fragmentParams?.get(k) ?? undefined;
  return {
    code: get("code"),
    state: get("state"),
    iss: get("iss"),
    error: get("error"),
    error_description: get("error_description"),
    error_uri: get("error_uri"),
    raw: url,
    receivedAt: Date.now(),
  };
}

export function hasCallbackParams(url: string): boolean {
  const u = new URL(url);
  const probe = (key: string) =>
    u.searchParams.has(key) ||
    (u.hash ? new URLSearchParams(u.hash.replace(/^#/, "")).has(key) : false);
  return probe("code") || probe("error");
}
