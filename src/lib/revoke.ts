// Step 12: revoke a token (RFC 7009). The AS responds 200 OK on success
// (regardless of whether the token was valid — the spec says clients
// shouldn't be able to probe for valid tokens).

import { applyClientAuth } from "./clientAuth";
import type { ClientConfigState, NetworkEntry, OidcMetadata } from "../types";

export type RevokeResult =
  | { ok: true; status: number }
  | {
      ok: false;
      message: string;
      status?: number;
      body?: string;
    };

export interface RevokeInput {
  metadata: OidcMetadata;
  client: ClientConfigState;
  token: string;
  tokenHint?: "access_token" | "refresh_token";
  onStart: (entry: NetworkEntry) => void;
  onFinish: (id: string, patch: Partial<NetworkEntry>) => void;
}

export async function revoke(input: RevokeInput): Promise<RevokeResult> {
  const endpoint = input.metadata.revocation_endpoint;
  if (typeof endpoint !== "string") {
    return {
      ok: false,
      message: "Discovery metadata has no revocation_endpoint.",
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
  if (!auth.ok) return { ok: false, message: auth.message };

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
        ? "CORS / network error reaching /revoke."
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
      message: `AS returned ${response.status} from /revoke.`,
      status: response.status,
      body: respBody,
    };
  }
  return { ok: true, status: response.status };
}
