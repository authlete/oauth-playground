// Grant Management API: read or revoke a grant the access token is bound to.
//
//   GET    {grant_management_endpoint}/{grant_id}   — needs scope grant_management_query
//   DELETE {grant_management_endpoint}/{grant_id}   — needs scope grant_management_revoke
//
// Both authenticate with the access token as a Bearer credential (this is a
// resource-style call to the AS, not an OAuth-client-authenticated endpoint).

import type { NetworkEntry, OidcMetadata } from "../types";

export type GrantQueryResult =
  | { ok: true; grant: Record<string, unknown> }
  | { ok: false; message: string; status?: number; body?: string };

export type GrantRevokeResult =
  | { ok: true; status: number }
  | { ok: false; message: string; status?: number; body?: string };

export interface GrantManagementInput {
  metadata: OidcMetadata;
  grantId: string;
  accessToken: string;
  onStart: (entry: NetworkEntry) => void;
  onFinish: (id: string, patch: Partial<NetworkEntry>) => void;
}

export async function queryGrant(
  input: GrantManagementInput,
): Promise<GrantQueryResult> {
  const sent = await send(input, "GET");
  if (!sent.ok) return sent;
  try {
    return {
      ok: true,
      grant: JSON.parse(sent.body) as Record<string, unknown>,
    };
  } catch {
    return { ok: false, message: "Grant response was not valid JSON." };
  }
}

export async function revokeGrant(
  input: GrantManagementInput,
): Promise<GrantRevokeResult> {
  const sent = await send(input, "DELETE");
  if (!sent.ok) return sent;
  return { ok: true, status: sent.status };
}

type SendResult =
  | { ok: true; status: number; body: string }
  | { ok: false; message: string; status?: number; body?: string };

// Fetch + network-log plumbing shared by both verbs. Returns ok:false for
// network errors and for any non-2xx status, so callers only handle the body.
async function send(
  input: GrantManagementInput,
  method: "GET" | "DELETE",
): Promise<SendResult> {
  const base = input.metadata.grant_management_endpoint;
  if (!base)
    return { ok: false, message: "No grant_management_endpoint in metadata." };
  const url = `${base.replace(/\/$/, "")}/${encodeURIComponent(input.grantId)}`;
  const headers = new Headers({
    Authorization: `Bearer ${input.accessToken}`,
    Accept: "application/json",
  });

  const id = crypto.randomUUID();
  const startedAt = performance.now();
  input.onStart({
    id,
    startedAt,
    method,
    url,
    requestHeaders: Object.fromEntries(headers.entries()),
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      mode: "cors",
      credentials: "omit",
      headers,
    });
  } catch (err) {
    const message =
      err instanceof TypeError
        ? "CORS / network error reaching the grant endpoint. Enable CORS on the AS for this origin."
        : err instanceof Error
          ? err.message
          : String(err);
    const finishedAt = performance.now();
    input.onFinish(id, {
      finishedAt,
      durationMs: Math.round(finishedAt - startedAt),
      errorMessage: message,
    });
    return { ok: false, message };
  }

  const body = await response.text();
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
    responseBody: body,
  });

  if (!response.ok) {
    return {
      ok: false,
      message: `AS returned ${response.status} from the grant endpoint.`,
      status: response.status,
      body,
    };
  }
  return { ok: true, status: response.status, body };
}
