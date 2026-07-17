// Share / restore non-secret state via a URL param. Per design §8:
// "Shareable link transfers setup, not run state." We include the issuer,
// the safe subset of client config (no secret / no private JWK), the auth
// request preferences (no state / nonce / verifier — those are CSRF
// tokens), and the PAR toggle. Everything else is regenerated on load.

import { base64urlDecode } from "./jwt";
import { base64urlEncode } from "./random";
import {
  DEFAULT_CLIENT_CONFIG,
  type AuthRequestState,
  type ClientAuthMethod,
  type ClientConfigState,
  type ResponseMode,
} from "../types";

export interface SharePayload {
  v: 1;
  issuer?: string;
  client?: {
    id: string;
    auth: ClientAuthMethod;
    redirect: string;
  };
  scopes?: string[];
  customScope?: string;
  responseType?: string;
  responseMode?: ResponseMode;
  pkce?: boolean;
  par?: boolean;
  jar?: boolean;
  prompt?: string;
  loginHint?: string;
  maxAge?: string;
}

export const SHARE_PARAM = "cfg";

export function encodeShare(payload: SharePayload): string {
  const json = JSON.stringify(payload);
  return base64urlEncode(new TextEncoder().encode(json));
}

export function decodeShare(encoded: string): SharePayload | null {
  try {
    const bytes = base64urlDecode(encoded);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as SharePayload;
    if (parsed?.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildShareUrl(origin: string, payload: SharePayload): string {
  const url = new URL("/", origin);
  url.searchParams.set(SHARE_PARAM, encodeShare(payload));
  return url.toString();
}

export function readShareFromUrl(): SharePayload | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const cfg = params.get(SHARE_PARAM);
  if (!cfg) return null;
  return decodeShare(cfg);
}

export function clearShareFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(SHARE_PARAM)) return;
  url.searchParams.delete(SHARE_PARAM);
  window.history.replaceState({}, "", url.toString());
}

/** Project the playground state into a compact, secret-free share payload. */
export function buildPayloadFromState(state: {
  discovery: { issuer: string };
  client: ClientConfigState;
  authRequest: AuthRequestState;
  par: { enabled: boolean };
}): SharePayload {
  const def = DEFAULT_CLIENT_CONFIG;
  return {
    v: 1,
    issuer: state.discovery.issuer,
    client: {
      id: state.client.clientId,
      auth: state.client.authMethod,
      redirect: state.client.redirectUri || def.redirectUri,
    },
    scopes: state.authRequest.scopes,
    customScope: state.authRequest.customScope || undefined,
    responseType: state.authRequest.responseType,
    responseMode: state.authRequest.responseMode,
    pkce: state.authRequest.pkceEnabled,
    par: state.par.enabled || undefined,
    jar: state.authRequest.jarEnabled || undefined,
    prompt: state.authRequest.prompt || undefined,
    loginHint: state.authRequest.loginHint || undefined,
    maxAge: state.authRequest.maxAge || undefined,
  };
}

