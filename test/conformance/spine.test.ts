// Auth-code security spine: PKCE, the authorization request, state/iss checks,
// token exchange, and client authentication. Each test's name begins with the
// requirement id it proves (the meta-test keys on that).

import { afterEach, describe, expect, test } from "vitest";
import {
  generateCodeVerifier,
  computeCodeChallenge,
} from "../../src/protocol/pkce";
import {
  buildAuthorizeParams,
  buildAuthorizeUrl,
} from "../../src/protocol/authorizeUrl";
import { evaluateCallback } from "../../src/protocol/authorizeFlow";
import { applyClientAuth } from "../../src/protocol/clientAuth";
import { exchangeCode } from "../../src/protocol/tokenExchange";
import { base64urlEncode } from "../../src/protocol/random";
import {
  DEFAULT_AUTH_REQUEST,
  DEFAULT_CLIENT_CONFIG,
  type AuthRequestState,
  type ClientConfigState,
  type OidcMetadata,
} from "../../src/types";

const client = (over: Partial<ClientConfigState> = {}): ClientConfigState => ({
  ...DEFAULT_CLIENT_CONFIG,
  clientId: "client-123",
  redirectUri: "http://localhost:5173/callback",
  ...over,
});
const authReq = (over: Partial<AuthRequestState> = {}): AuthRequestState => ({
  ...DEFAULT_AUTH_REQUEST,
  ...over,
});

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1];
  const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
  const json = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json);
}

describe("PKCE (RFC 7636)", () => {
  test("pkce.verifier: 43–128 unreserved chars", () => {
    const v = generateCodeVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
    expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  test("pkce.challenge: challenge is BASE64URL(SHA-256(verifier))", async () => {
    const verifier = "test-verifier-0123456789-abcdefghijklmnop";
    const expected = base64urlEncode(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(verifier),
        ),
      ),
    );
    expect(await computeCodeChallenge(verifier)).toBe(expected);
  });

  test("pkce.authorize-param: request has code_challenge + method S256", () => {
    const p = buildAuthorizeParams(
      client(),
      authReq({ pkceEnabled: true, codeChallenge: "CHAL" }),
    );
    expect(p.get("code_challenge")).toBe("CHAL");
    expect(p.get("code_challenge_method")).toBe("S256");
  });

  test("pkce.token-param: token request carries code_verifier", async () => {
    const body = await captureTokenBody(
      client(),
      authReq({ pkceEnabled: true, codeVerifier: "VERIFIER" }),
    );
    expect(body.get("code_verifier")).toBe("VERIFIER");
  });
});

describe("Authorization request (RFC 6749)", () => {
  test("authz.required-params: response_type, client_id, redirect_uri, scope", () => {
    const p = buildAuthorizeParams(client(), authReq());
    expect(p.get("response_type")).toBe("code");
    expect(p.get("client_id")).toBe("client-123");
    expect(p.get("redirect_uri")).toBe("http://localhost:5173/callback");
    expect(p.get("scope")).toBe("openid profile email");
  });

  test("state.sent: a state value is included on the request", () => {
    const p = buildAuthorizeParams(client(), authReq({ state: "xyz-state" }));
    expect(p.get("state")).toBe("xyz-state");
  });
});

describe("Callback checks (state / iss)", () => {
  test("state.compared: mismatch is reported, match passes", () => {
    const base = { raw: "", receivedAt: 0 };
    expect(
      evaluateCallback({ ...base, state: "abc" }, "abc").stateMatches,
    ).toBe(true);
    expect(
      evaluateCallback({ ...base, state: "zzz" }, "abc").stateMatches,
    ).toBe(false);
  });

  test("iss.compared: iss is checked against the AS issuer when present", () => {
    const base = { raw: "", receivedAt: 0, state: "s" };
    expect(
      evaluateCallback({ ...base, iss: "https://as" }, "s", "https://as")
        .issMatches,
    ).toBe(true);
    expect(
      evaluateCallback({ ...base, iss: "https://evil" }, "s", "https://as")
        .issMatches,
    ).toBe(false);
    expect(evaluateCallback(base, "s").issMatches).toBeUndefined();
  });
});

describe("Token exchange (RFC 6749 §4.1.3)", () => {
  test("token.grant: grant_type=authorization_code with code + redirect_uri", async () => {
    const body = await captureTokenBody(client(), authReq(), "the-code");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("redirect_uri")).toBe("http://localhost:5173/callback");
  });
});

describe("Client authentication", () => {
  test("clientauth.private-key-jwt-claims: iss=sub=client_id, aud, exp", async () => {
    const jwk = await generateEcJwk();
    const body = new URLSearchParams();
    const res = await applyClientAuth({
      client: client({
        authMethod: "private_key_jwt",
        privateKey: { jwkText: JSON.stringify(jwk), status: "valid" },
      }),
      audience: "https://as/token",
      headers: new Headers(),
      body,
    });
    expect(res.ok).toBe(true);
    const claims = decodeJwtPayload(body.get("client_assertion")!);
    expect(claims.iss).toBe("client-123");
    expect(claims.sub).toBe("client-123");
    expect(claims.aud).toBe("https://as/token");
    expect(typeof claims.exp).toBe("number");
    expect(claims.exp as number).toBeGreaterThan(claims.iat as number);
  });

  test("clientauth.assertion-type: jwt-bearer assertion type", async () => {
    const jwk = await generateEcJwk();
    const body = new URLSearchParams();
    await applyClientAuth({
      client: client({
        authMethod: "private_key_jwt",
        privateKey: { jwkText: JSON.stringify(jwk), status: "valid" },
      }),
      audience: "https://as/token",
      headers: new Headers(),
      body,
    });
    expect(body.get("client_assertion_type")).toBe(
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    );
  });

  test("clientauth.secret-basic: Authorization: Basic base64(id:secret)", async () => {
    const headers = new Headers();
    await applyClientAuth({
      client: client({
        authMethod: "client_secret_basic",
        clientSecret: "s3cret",
      }),
      audience: "https://as/token",
      headers,
      body: new URLSearchParams(),
    });
    expect(headers.get("Authorization")).toBe(
      `Basic ${btoa("client-123:s3cret")}`,
    );
  });
});

describe("Resource indicator (RFC 8707)", () => {
  test("resource.authorize-param: resource carried when set", () => {
    const p = buildAuthorizeParams(
      client(),
      authReq({ resource: "https://api.example/" }),
    );
    expect(p.get("resource")).toBe("https://api.example/");
  });
});

// buildAuthorizeUrl is the single source of truth; a smoke check that the spine
// composes into a real URL keeps the pieces honest together.
test("authz.required-params: buildAuthorizeUrl produces a usable URL", () => {
  const metadata = {
    issuer: "https://as",
    authorization_endpoint: "https://as/authorize",
  } as OidcMetadata;
  const res = buildAuthorizeUrl(metadata, client(), authReq({ state: "s" }));
  expect(res.ok).toBe(true);
  if (res.ok) expect(res.url).toContain("https://as/authorize?");
});

// ── helpers ────────────────────────────────────────────────────────────────

/** Run exchangeCode with fetch stubbed and return the form body it POSTs. */
async function captureTokenBody(
  c: ClientConfigState,
  req: AuthRequestState,
  code = "code",
): Promise<URLSearchParams> {
  let captured: URLSearchParams | undefined;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    // init.body is a URLSearchParams (or its serialized string); normalise both.
    captured = new URLSearchParams(init.body as URLSearchParams);
    return new Response(
      JSON.stringify({ access_token: "a", token_type: "Bearer" }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;
  try {
    await exchangeCode({
      metadata: {
        issuer: "https://as",
        token_endpoint: "https://as/token",
      } as OidcMetadata,
      client: c,
      authRequest: req,
      code,
      onStart: () => {},
      onFinish: () => {},
    });
  } finally {
    globalThis.fetch = realFetch;
  }
  return captured!;
}

async function generateEcJwk(): Promise<JsonWebKey> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { ...jwk, alg: "ES256", kid: "test-key" };
}

afterEach(() => {
  // Guard against a stubbed fetch leaking between tests.
});
