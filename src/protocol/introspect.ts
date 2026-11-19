// POST introspection_endpoint (RFC 7662, Section 2.1). The caller — typically a
// resource server — must authenticate, separately from the OAuth client auth at
// /token. The RFC lets the RS present its own credential two ways:
//   - a token it holds (Authorization: Bearer …) — `callerAuthorization`, or
//   - its own OAuth client credentials, if it's a registered client — pass
//     `client` and we authenticate exactly like /revoke (applyClientAuth).
// Many Authlete-style ASes require the latter on /introspect.

import { applyClientAuth } from "./clientAuth";
import type { ClientConfigState, NetworkEntry, OidcMetadata } from "../types";

export type IntrospectResult =
  | { ok: true; result: { active: boolean } & Record<string, unknown> }
  | {
      ok: false;
      message: string;
      status?: number;
      body?: string;
    };

export interface IntrospectInput {
  metadata: OidcMetadata;
  token: string;
  tokenHint?: "access_token" | "refresh_token";
  /** When set, authenticate the caller as an OAuth client (RFC 7662 §2.1 allows
   * the RS's own client credentials) via Client config — same as /revoke. Takes
   * precedence over `callerAuthorization`. */
  client?: ClientConfigState;
  /** Raw Authorization header value for the introspection caller (e.g.
   * "Bearer …" or "Basic …"), used when `client` is absent. Blank sends no
   * Authorization header — most ASes will then reject, which is honest wire
   * behavior. */
  callerAuthorization?: string;
  onStart: (entry: NetworkEntry) => void;
  onFinish: (id: string, patch: Partial<NetworkEntry>) => void;
}

export async function introspect(
  input: IntrospectInput,
): Promise<IntrospectResult> {
  const endpoint = input.metadata.introspection_endpoint;
  if (typeof endpoint !== "string") {
    return {
      ok: false,
      message:
        "Discovery metadata has no introspection_endpoint. This AS doesn't support introspection.",
    };
  }

  const body = new URLSearchParams();
  body.set("token", input.token);
  if (input.tokenHint) body.set("token_type_hint", input.tokenHint);

  const headers = new Headers({
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  });
  if (input.client) {
    const auth = await applyClientAuth({
      client: input.client,
      audience: endpoint,
      issuer: input.metadata.issuer,
      headers,
      body,
    });
    if (!auth.ok) return { ok: false, message: auth.message };
  } else {
    const callerAuth = input.callerAuthorization?.trim();
    if (callerAuth) {
      headers.set("Authorization", callerAuth);
    }
  }

  const id = crypto.randomUUID();
  const startedAt = performance.now();
  input.onStart({
    id,
    startedAt,
    method: "POST",
    url: endpoint,
    requestHeaders: Object.fromEntries(headers.entries()),
    requestBody: body.toString(),
  });

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers,
      body: body.toString(),
    });
  } catch (err) {
    const finishedAt = performance.now();
    const message =
      err instanceof TypeError
        ? "CORS / network error reaching /introspect."
        : err instanceof Error
          ? err.message
          : String(err);
    input.onFinish(id, {
      finishedAt,
      durationMs: Math.round(finishedAt - startedAt),
      errorMessage: message,
    });
    return { ok: false, message };
  }

  const respBody = await response.text();
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
    responseBody: respBody,
  });

  if (!response.ok) {
    return {
      ok: false,
      message: `AS returned ${response.status} from /introspect.`,
      status: response.status,
      body: respBody,
    };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(respBody) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      message: "/introspect response was not JSON.",
      status: response.status,
      body: respBody,
    };
  }
  if (typeof parsed.active !== "boolean") {
    return {
      ok: false,
      message: "/introspect response is missing required `active` field.",
      status: response.status,
      body: respBody,
    };
  }
  return {
    ok: true,
    result: parsed as { active: boolean } & Record<string, unknown>,
  };
}
