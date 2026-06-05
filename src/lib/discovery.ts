import type { Jwks, NetworkEntry, OidcMetadata } from "../types";

export type DiscoveryError =
  | { kind: "invalid-url"; message: string }
  | { kind: "cors-error"; message: string }
  | { kind: "network-error"; message: string }
  | { kind: "http-error"; status: number; statusText: string; body: string }
  | { kind: "malformed"; missing: string[]; raw: string };

export interface DiscoveryFetchOk {
  ok: true;
  metadata: OidcMetadata;
  jwks?: Jwks;
  jwksError?: DiscoveryError;
  durationMs: number;
}

export interface DiscoveryFetchErr {
  ok: false;
  error: DiscoveryError;
  durationMs: number;
}

export type DiscoveryFetchResult = DiscoveryFetchOk | DiscoveryFetchErr;

const REQUIRED_OIDC_FIELDS = [
  "issuer",
  "authorization_endpoint",
  "token_endpoint",
  "jwks_uri",
] as const;

function normalizeIssuer(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // Strip trailing slash on the issuer base for canonical .well-known concat.
    return trimmed.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function classifyFetchError(err: unknown): DiscoveryError {
  // The browser collapses CORS and network errors into the same opaque
  // TypeError. Best-effort: if we're online and got a TypeError, the most
  // likely cause is CORS (the v0.1 #1 footgun per design B.9).
  if (err instanceof TypeError) {
    const message = err.message || "Failed to fetch";
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { kind: "network-error", message: "You appear to be offline." };
    }
    return { kind: "cors-error", message };
  }
  return {
    kind: "network-error",
    message: err instanceof Error ? err.message : String(err),
  };
}

interface RunFetchOptions {
  method: "GET";
  url: string;
  onStart: (entry: NetworkEntry) => void;
  onFinish: (id: string, patch: Partial<NetworkEntry>) => void;
}

async function runFetch(opts: RunFetchOptions): Promise<
  | { ok: true; status: number; body: string; headers: Record<string, string> }
  | { ok: false; error: DiscoveryError }
> {
  const id = crypto.randomUUID();
  const startedAt = performance.now();
  opts.onStart({
    id,
    startedAt,
    method: opts.method,
    url: opts.url,
  });

  let response: Response;
  try {
    response = await fetch(opts.url, {
      method: opts.method,
      mode: "cors",
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    const finishedAt = performance.now();
    const error = classifyFetchError(err);
    opts.onFinish(id, {
      finishedAt,
      durationMs: Math.round(finishedAt - startedAt),
      errorMessage:
        error.kind === "cors-error"
          ? "CORS or network error"
          : "message" in error
            ? error.message
            : "Request failed",
    });
    return { ok: false, error };
  }

  const body = await response.text();
  const finishedAt = performance.now();
  const headers: Record<string, string> = {};
  response.headers.forEach((v, k) => {
    headers[k] = v;
  });
  opts.onFinish(id, {
    finishedAt,
    durationMs: Math.round(finishedAt - startedAt),
    status: response.status,
    statusText: response.statusText,
    responseHeaders: headers,
    responseBody: body,
  });

  if (!response.ok) {
    return {
      ok: false,
      error: {
        kind: "http-error",
        status: response.status,
        statusText: response.statusText,
        body,
      },
    };
  }
  return { ok: true, status: response.status, body, headers };
}

export async function fetchDiscovery(
  issuerInput: string,
  callbacks: {
    onStart: (entry: NetworkEntry) => void;
    onFinish: (id: string, patch: Partial<NetworkEntry>) => void;
  },
): Promise<DiscoveryFetchResult> {
  const startedAt = performance.now();
  const issuer = normalizeIssuer(issuerInput);
  if (!issuer) {
    return {
      ok: false,
      error: {
        kind: "invalid-url",
        message:
          "Issuer must be an absolute http:// or https:// URL (e.g. http://localhost:3000).",
      },
      durationMs: 0,
    };
  }

  const metadataUrl = `${issuer}/.well-known/openid-configuration`;
  const metaResult = await runFetch({
    method: "GET",
    url: metadataUrl,
    ...callbacks,
  });

  if (!metaResult.ok) {
    return {
      ok: false,
      error: metaResult.error,
      durationMs: Math.round(performance.now() - startedAt),
    };
  }

  let metadata: OidcMetadata;
  try {
    metadata = JSON.parse(metaResult.body) as OidcMetadata;
  } catch {
    return {
      ok: false,
      error: {
        kind: "malformed",
        missing: ["valid JSON"],
        raw: metaResult.body.slice(0, 4000),
      },
      durationMs: Math.round(performance.now() - startedAt),
    };
  }

  const missing = REQUIRED_OIDC_FIELDS.filter(
    (field) =>
      typeof (metadata as Record<string, unknown>)[field] !== "string",
  );
  if (missing.length > 0) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        missing,
        raw: metaResult.body.slice(0, 4000),
      },
      durationMs: Math.round(performance.now() - startedAt),
    };
  }

  // JWKS fetch (sequential, per B.13 — clearer log).
  let jwks: Jwks | undefined;
  let jwksError: DiscoveryError | undefined;
  if (typeof metadata.jwks_uri === "string") {
    const jwksResult = await runFetch({
      method: "GET",
      url: metadata.jwks_uri,
      ...callbacks,
    });
    if (jwksResult.ok) {
      try {
        jwks = JSON.parse(jwksResult.body) as Jwks;
      } catch {
        jwksError = {
          kind: "malformed",
          missing: ["valid JSON"],
          raw: jwksResult.body.slice(0, 4000),
        };
      }
    } else {
      jwksError = jwksResult.error;
    }
  }

  return {
    ok: true,
    metadata,
    jwks,
    jwksError,
    durationMs: Math.round(performance.now() - startedAt),
  };
}
