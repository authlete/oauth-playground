// OpenID Federation 1.0 — Explicit Client Registration.
//
// POST the RP's signed entity configuration (Content-Type
// `application/entity-statement+jwt`) OR a serialized trust chain
// (Content-Type `application/trust-chain+json`) to the AS's
// federation_registration_endpoint. On success the AS returns a signed entity
// statement containing the issued `client_id` in its `sub` claim.

import { parseJwt } from "./jwt";
import type { FederationRegisterMode, NetworkEntry } from "../types";

const CONTENT_TYPE: Record<FederationRegisterMode, string> = {
  "entity-config": "application/entity-statement+jwt",
  "trust-chain": "application/trust-chain+json",
};

export interface SubmitInput {
  endpoint: string;
  mode: FederationRegisterMode;
  payload: string;
  onStart: (entry: NetworkEntry) => void;
  onFinish: (id: string, patch: Partial<NetworkEntry>) => void;
}

export type SubmitResult =
  | {
      ok: true;
      responseJwt: string;
      issuedClientId?: string;
    }
  | {
      ok: false;
      message: string;
      status?: number;
      body?: string;
    };

export async function submitFederationRegistration(
  input: SubmitInput,
): Promise<SubmitResult> {
  const body = input.payload.trim();
  if (!body) return { ok: false, message: "Payload is empty." };

  const headers = new Headers({
    "Content-Type": CONTENT_TYPE[input.mode],
    Accept: "application/entity-statement+jwt",
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
        ? "CORS / network error reaching the federation registration endpoint."
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
      message: `AS returned ${response.status} from federation registration.`,
      status: response.status,
      body: responseBody,
    };
  }

  const responseJwt = responseBody.trim();
  const parsed = parseJwt(responseJwt);
  const issuedClientId =
    parsed.ok && typeof parsed.jwt.payload.sub === "string"
      ? (parsed.jwt.payload.sub as string)
      : undefined;
  return { ok: true, responseJwt, issuedClientId };
}
