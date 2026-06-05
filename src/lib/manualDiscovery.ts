// Step 1 "manual" mode: synthesize an OIDC metadata object from a hand-
// typed form, optionally fetch the JWKS, and feed `state.discovery.metadata`
// — so every downstream step works unchanged.

import type {
  Jwks,
  ManualEndpoints,
  NetworkEntry,
  OidcMetadata,
} from "../types";

export type ManualApplyResult =
  | {
      ok: true;
      metadata: OidcMetadata;
      jwks?: Jwks;
      jwksError?: string;
    }
  | { ok: false; message: string };

export interface ManualApplyInput {
  endpoints: ManualEndpoints;
  /** When true, attempt to GET jwks_uri and populate state.discovery.jwks. */
  fetchJwks: boolean;
  onStart: (entry: NetworkEntry) => void;
  onFinish: (id: string, patch: Partial<NetworkEntry>) => void;
}

const REQUIRED: Array<keyof ManualEndpoints> = [
  "issuer",
  "authorization_endpoint",
  "token_endpoint",
];

export async function applyManual(
  input: ManualApplyInput,
): Promise<ManualApplyResult> {
  const e = input.endpoints;
  for (const field of REQUIRED) {
    if (!e[field].trim()) {
      return { ok: false, message: `${field} is required.` };
    }
  }
  for (const [key, value] of Object.entries(e) as Array<[keyof ManualEndpoints, string]>) {
    if (!value.trim()) continue;
    try {
      const u = new URL(value);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return { ok: false, message: `${key} must be http(s).` };
      }
    } catch {
      return { ok: false, message: `${key} is not a valid URL.` };
    }
  }

  const metadata: OidcMetadata = { issuer: e.issuer };
  for (const [key, value] of Object.entries(e) as Array<[keyof ManualEndpoints, string]>) {
    if (key !== "issuer" && value.trim()) {
      (metadata as Record<string, unknown>)[key] = value.trim();
    }
  }

  if (input.fetchJwks && e.jwks_uri.trim()) {
    const jwksResult = await fetchJwks(e.jwks_uri.trim(), input);
    if (jwksResult.ok) {
      return { ok: true, metadata, jwks: jwksResult.jwks };
    }
    return { ok: true, metadata, jwksError: jwksResult.message };
  }
  return { ok: true, metadata };
}

type JwksFetchResult =
  | { ok: true; jwks: Jwks }
  | { ok: false; message: string };

async function fetchJwks(
  url: string,
  cb: { onStart: ManualApplyInput["onStart"]; onFinish: ManualApplyInput["onFinish"] },
): Promise<JwksFetchResult> {
  const id = crypto.randomUUID();
  const startedAt = performance.now();
  cb.onStart({ id, startedAt, method: "GET", url });
  let response: Response;
  try {
    response = await fetch(url, { method: "GET", mode: "cors", credentials: "omit" });
  } catch (err) {
    const finishedAt = performance.now();
    const message =
      err instanceof TypeError
        ? "CORS / network error fetching JWKS."
        : err instanceof Error
          ? err.message
          : String(err);
    cb.onFinish(id, {
      finishedAt,
      durationMs: Math.round(finishedAt - startedAt),
      errorMessage: message,
    });
    return { ok: false, message };
  }
  const body = await response.text();
  const finishedAt = performance.now();
  const headers: Record<string, string> = {};
  response.headers.forEach((v, k) => {
    headers[k] = v;
  });
  cb.onFinish(id, {
    finishedAt,
    durationMs: Math.round(finishedAt - startedAt),
    status: response.status,
    statusText: response.statusText,
    responseHeaders: headers,
    responseBody: body,
  });
  if (!response.ok) {
    return { ok: false, message: `JWKS endpoint returned ${response.status}.` };
  }
  try {
    const parsed = JSON.parse(body) as Jwks;
    if (!Array.isArray(parsed.keys)) {
      return { ok: false, message: "JWKS response missing `keys` array." };
    }
    return { ok: true, jwks: parsed };
  } catch {
    return { ok: false, message: "JWKS response was not valid JSON." };
  }
}
