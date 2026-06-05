// Step 9: POST introspection_endpoint (RFC 7662). Client auth is required;
// the AS uses it to decide whether the caller is allowed to introspect.

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
  client: ClientConfigState;
  token: string;
  tokenHint?: "access_token" | "refresh_token";
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
  const auth = await applyClientAuth({
    client: input.client,
    audience: endpoint,
    headers,
    body,
  });
  if (!auth.ok) {
    return { ok: false, message: auth.message };
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
