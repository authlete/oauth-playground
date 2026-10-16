// What you do once you hold a token: refresh, revoke, introspect, userinfo.
// Each test pins the request these put on the wire.

import { describe, expect, test } from "vitest";
import { refreshTokens } from "../../src/protocol/refresh";
import { revoke } from "../../src/protocol/revoke";
import { introspect } from "../../src/protocol/introspect";
import { fetchUserInfo } from "../../src/protocol/userInfo";
import {
  DEFAULT_CLIENT_CONFIG,
  type ClientConfigState,
  type OidcMetadata,
} from "../../src/types";

const client: ClientConfigState = { ...DEFAULT_CLIENT_CONFIG, clientId: "c1" };
const metadata = {
  issuer: "https://as",
  token_endpoint: "https://as/token",
  revocation_endpoint: "https://as/revoke",
  introspection_endpoint: "https://as/introspect",
  userinfo_endpoint: "https://as/userinfo",
} as OidcMetadata;

interface Captured {
  url: string;
  method?: string;
  headers: Headers;
  body?: URLSearchParams;
}

/** Stub fetch, run the call, and return the request it tried to send. */
async function capture(run: () => Promise<unknown>): Promise<Captured> {
  let captured: Captured | undefined;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    captured = {
      url,
      method: init.method,
      headers: new Headers(init.headers),
      body: init.body
        ? new URLSearchParams(init.body as URLSearchParams)
        : undefined,
    };
    return new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = realFetch;
  }
  return captured!;
}

const noop = () => {};

describe("Refresh (RFC 6749 §6)", () => {
  test("refresh.grant: grant_type=refresh_token with the refresh_token", async () => {
    const req = await capture(() =>
      refreshTokens({
        metadata,
        client,
        refreshToken: "rt-abc",
        onStart: noop,
        onFinish: noop,
      }),
    );
    expect(req.url).toBe("https://as/token");
    expect(req.body?.get("grant_type")).toBe("refresh_token");
    expect(req.body?.get("refresh_token")).toBe("rt-abc");
  });
});

describe("Revocation (RFC 7009)", () => {
  test("revoke.request: POST token + token_type_hint to the revocation endpoint", async () => {
    const req = await capture(() =>
      revoke({
        metadata,
        client,
        token: "tok-1",
        tokenHint: "access_token",
        onStart: noop,
        onFinish: noop,
      }),
    );
    expect(req.url).toBe("https://as/revoke");
    expect(req.method).toBe("POST");
    expect(req.body?.get("token")).toBe("tok-1");
    expect(req.body?.get("token_type_hint")).toBe("access_token");
  });
});

describe("Introspection (RFC 7662)", () => {
  test("introspect.request: POST token to the introspection endpoint", async () => {
    const req = await capture(() =>
      introspect({
        metadata,
        token: "tok-2",
        callerAuthorization: "Bearer caller",
        onStart: noop,
        onFinish: noop,
      }),
    );
    expect(req.url).toBe("https://as/introspect");
    expect(req.method).toBe("POST");
    expect(req.body?.get("token")).toBe("tok-2");
  });
});

describe("UserInfo (OIDC Core §5.3)", () => {
  test("userinfo.bearer: access token sent as Authorization: Bearer", async () => {
    const req = await capture(() =>
      fetchUserInfo({
        metadata,
        accessToken: "at-xyz",
        onStart: noop,
        onFinish: noop,
      }),
    );
    expect(req.url).toBe("https://as/userinfo");
    expect(req.method).toBe("GET");
    expect(req.headers.get("Authorization")).toBe("Bearer at-xyz");
  });
});
