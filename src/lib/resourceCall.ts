// Step 10: a tiny generic HTTP client for hitting a user-owned resource server.
// Out of scope: any AS interaction. The only OAuth-y bit is the optional
// "Attach Bearer" toggle that adds the access_token from step 6.

import type { HttpMethod, NetworkEntry } from "../types";

export interface ResourceCallInput {
  url: string;
  method: HttpMethod;
  headersText: string;
  bodyText: string;
  attachBearer: boolean;
  accessToken?: string;
  onStart: (entry: NetworkEntry) => void;
  onFinish: (id: string, patch: Partial<NetworkEntry>) => void;
}

export type ResourceCallResult =
  | {
      ok: true;
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
      durationMs: number;
    }
  | { ok: false; message: string };

const ALLOWED_METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
];

export async function resourceCall(
  input: ResourceCallInput,
): Promise<ResourceCallResult> {
  if (!ALLOWED_METHODS.includes(input.method)) {
    return { ok: false, message: `Method not supported: ${input.method}` };
  }
  const trimmedUrl = input.url.trim();
  if (!trimmedUrl) return { ok: false, message: "URL is empty." };
  try {
    const u = new URL(trimmedUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { ok: false, message: "URL must be http(s)." };
    }
  } catch {
    return { ok: false, message: "URL is malformed." };
  }

  const headers = new Headers();
  if (input.headersText.trim()) {
    try {
      const obj = JSON.parse(input.headersText) as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string") headers.set(k, v);
      }
    } catch {
      return {
        ok: false,
        message: "Custom headers must be a JSON object of string values.",
      };
    }
  }
  if (input.attachBearer && input.accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${input.accessToken}`);
  }

  const init: RequestInit = {
    method: input.method,
    mode: "cors",
    credentials: "omit",
    headers,
  };
  if (input.method !== "GET" && input.method !== "HEAD" && input.bodyText) {
    init.body = input.bodyText;
    if (!headers.has("Content-Type")) {
      // Best-effort content-type detection.
      const trimmed = input.bodyText.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        headers.set("Content-Type", "application/json");
      } else if (trimmed.includes("=") && !trimmed.includes(" ")) {
        headers.set("Content-Type", "application/x-www-form-urlencoded");
      }
    }
  }

  const id = crypto.randomUUID();
  const startedAt = performance.now();
  input.onStart({
    id,
    startedAt,
    method: input.method,
    url: trimmedUrl,
    requestHeaders: Object.fromEntries(headers.entries()),
    requestBody: typeof init.body === "string" ? init.body : undefined,
  });

  let response: Response;
  try {
    response = await fetch(trimmedUrl, init);
  } catch (err) {
    const finishedAt = performance.now();
    const message =
      err instanceof TypeError
        ? "CORS / network error reaching the resource."
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
  const durationMs = Math.round(finishedAt - startedAt);
  input.onFinish(id, {
    finishedAt,
    durationMs,
    status: response.status,
    statusText: response.statusText,
    responseHeaders: respHeaders,
    responseBody: body,
  });
  return {
    ok: true,
    status: response.status,
    statusText: response.statusText,
    headers: respHeaders,
    body,
    durationMs,
  };
}
