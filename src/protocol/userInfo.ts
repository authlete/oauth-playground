// GET userinfo_endpoint with the access_token (OIDC Core §5.3). With DPoP the
// token is presented under the DPoP scheme (RFC 9449 §7.1) with a proof bound
// to the token (`ath`); otherwise Bearer. JSON response is a flat claims object.

import { send } from "./dpopHttp";
import type { DpopContext } from "./dpop";
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
  dpop?: DpopContext;
  onDpopNonce?: (nonce: string) => void;
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
  // Bearer by default; `send` rewrites Authorization to the DPoP scheme when a
  // DPoP context is present (and adds the token-bound `ath` proof claim).
  const headers = new Headers({
    Authorization: `Bearer ${input.accessToken}`,
    Accept: "application/json",
  });

  const sent = await send({
    method: "GET",
    url: endpoint,
    headers,
    dpop: input.dpop
      ? {
          ctx: input.dpop,
          accessToken: input.accessToken,
          onNonce: input.onDpopNonce,
        }
      : undefined,
    onStart: input.onStart,
    onFinish: input.onFinish,
    networkErrorMessage: (err) =>
      err instanceof TypeError
        ? "CORS / network error reaching /userinfo."
        : err instanceof Error
          ? err.message
          : String(err),
  });
  if (!sent.ok) return { ok: false, message: sent.message };
  const { response, bodyText: body } = sent;

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
  // surface JWT-shaped responses as a single "_jwt" claim so the Token inspector can
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
