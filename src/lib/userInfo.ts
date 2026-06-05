// Step 8: GET userinfo_endpoint with Bearer access_token (OIDC Core §5.3).
// JSON response is a flat object of claims about the end-user.

import type { NetworkEntry, OidcMetadata } from "../types";

export type UserInfoResult =
  | { ok: true; claims: Record<string, unknown> }
  | {
      ok: false;
      message: string;
      status?: number;
      body?: string;
    };

export interface FetchUserInfoInput {
  metadata: OidcMetadata;
  accessToken: string;
  onStart: (entry: NetworkEntry) => void;
  onFinish: (id: string, patch: Partial<NetworkEntry>) => void;
}

export async function fetchUserInfo(
  input: FetchUserInfoInput,
): Promise<UserInfoResult> {
  const endpoint = input.metadata.userinfo_endpoint;
  if (typeof endpoint !== "string") {
    return {
      ok: false,
      message:
        "Discovery metadata has no userinfo_endpoint. The AS may not be an OIDC provider.",
    };
  }
  const headers = new Headers({
    Authorization: `Bearer ${input.accessToken}`,
    Accept: "application/json",
  });
  const id = crypto.randomUUID();
  const startedAt = performance.now();
  input.onStart({
    id,
    startedAt,
    method: "GET",
    url: endpoint,
    requestHeaders: Object.fromEntries(headers.entries()),
  });

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      headers,
    });
  } catch (err) {
    const finishedAt = performance.now();
    const message =
      err instanceof TypeError
        ? "CORS / network error reaching /userinfo."
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
      message: `AS returned ${response.status} from /userinfo.`,
      status: response.status,
      body,
    };
  }
  // userinfo response may be JSON (default) or signed JWT (per OIDC Core §5.3.2)
  // depending on `userinfo_signed_response_alg` in client registration. We
  // surface JWT-shaped responses as a single "_jwt" claim so step 7 can
  // inspect them.
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/jwt") || isJwtShape(body)) {
    return { ok: true, claims: { _jwt: body } };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      message: "/userinfo response was not JSON.",
      status: response.status,
      body,
    };
  }
  return { ok: true, claims: parsed };
}

function isJwtShape(s: string): boolean {
  const trimmed = s.trim();
  const parts = trimmed.split(".");
  return parts.length === 3 && parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p));
}
