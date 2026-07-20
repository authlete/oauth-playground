// Dynamic Client Registration (RFC 7591).
//
// POST a JSON client-metadata document to the AS's `registration_endpoint`.
// On success (201) the AS returns the issued `client_id`, an optional
// `client_secret`, and the RFC 7592 management fields
// (`registration_access_token` + `registration_client_uri`), plus an echo of
// the accepted metadata. No client auth — open registration.

import type { DcrRegisteredClient, NetworkEntry } from "../types";

export interface RegisterClientInput {
  endpoint: string;
  /** RFC 7591 client metadata — sent verbatim as the JSON request body. */
  request: Record<string, unknown>;
  onStart: (entry: NetworkEntry) => void;
  onFinish: (id: string, patch: Partial<NetworkEntry>) => void;
}

export type RegisterClientResult =
  | { ok: true; client: DcrRegisteredClient }
  | { ok: false; message: string; status?: number; body?: string };

export async function registerClient(
  input: RegisterClientInput,
): Promise<RegisterClientResult> {
  const body = JSON.stringify(input.request, null, 2);
  const headers = new Headers({
    "Content-Type": "application/json",
    Accept: "application/json",
  });

  const id = crypto.randomUUID();
  const startedAt = performance.now();
  input.onStart({
    id,
    startedAt,
    method: "POST",
    url: input.endpoint,
    requestHeaders: Object.fromEntries(headers.entries()),
    requestBody: body,
  });

  let response: Response;
  try {
    response = await fetch(input.endpoint, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers,
      body,
    });
  } catch (err) {
    const finishedAt = performance.now();
    const message =
      err instanceof TypeError
        ? "CORS / network error reaching the registration endpoint."
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

  const responseBody = await response.text();
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
    responseBody,
  });

  if (!response.ok) {
    return {
      ok: false,
      message: `AS returned ${response.status} from the registration endpoint.`,
      status: response.status,
      body: responseBody,
    };
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(responseBody) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      message: "Registration response was not valid JSON.",
      status: response.status,
      body: responseBody,
    };
  }

  if (typeof raw.client_id !== "string") {
    return {
      ok: false,
      message: "Registration response is missing `client_id`.",
      status: response.status,
      body: responseBody,
    };
  }

  const str = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : undefined);
  const num = (k: string) => (typeof raw[k] === "number" ? (raw[k] as number) : undefined);

  return {
    ok: true,
    client: {
      clientId: raw.client_id as string,
      clientSecret: str("client_secret"),
      clientSecretExpiresAt: num("client_secret_expires_at"),
      clientIdIssuedAt: num("client_id_issued_at"),
      registrationAccessToken: str("registration_access_token"),
      registrationClientUri: str("registration_client_uri"),
      raw,
    },
  };
}

/** Split a whitespace/newline-separated redirect_uris textarea into a clean array. */
export function parseRedirectUris(text: string): string[] {
  return text
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Build the RFC 7591 request body from the form state, omitting empty fields. */
export function buildRegistrationRequest(form: {
  clientName: string;
  redirectUris: string;
  tokenEndpointAuthMethod: string;
  grantTypes: string[];
  scope: string;
}): Record<string, unknown> {
  const redirectUris = parseRedirectUris(form.redirectUris);
  const req: Record<string, unknown> = {
    token_endpoint_auth_method: form.tokenEndpointAuthMethod,
    grant_types: form.grantTypes,
  };
  // Omit response_types when empty — RFC 7591 defaults an absent value to
  // ["code"], and some AS validators reject an explicit empty array.
  if (form.grantTypes.includes("authorization_code")) req.response_types = ["code"];
  if (form.clientName.trim()) req.client_name = form.clientName.trim();
  if (redirectUris.length) req.redirect_uris = redirectUris;
  if (form.scope.trim()) req.scope = form.scope.trim();
  return req;
}
