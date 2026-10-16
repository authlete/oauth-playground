// Non-redirect token flows: the request each puts on the wire. Device first.

import { describe, expect, test } from "vitest";
import { startDeviceAuthorization } from "../../src/protocol/deviceAuth";
import {
  DEFAULT_AUTH_REQUEST,
  DEFAULT_CLIENT_CONFIG,
  type OidcMetadata,
} from "../../src/types";

const metadata = {
  issuer: "https://as",
  device_authorization_endpoint: "https://as/device",
} as OidcMetadata;

describe("Device Authorization Grant (RFC 8628)", () => {
  test("device.client-id: request body carries client_id (confidential client)", async () => {
    let body: URLSearchParams | undefined;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      body = new URLSearchParams(init.body as URLSearchParams);
      return new Response(
        JSON.stringify({
          device_code: "d",
          user_code: "U",
          verification_uri: "https://as/activate",
          expires_in: 300,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      await startDeviceAuthorization({
        metadata,
        // confidential: secret goes in the auth header, so the body must still
        // carry client_id on its own.
        client: {
          ...DEFAULT_CLIENT_CONFIG,
          clientId: "device-client",
          authMethod: "client_secret_basic",
          clientSecret: "s3cret",
        },
        authRequest: DEFAULT_AUTH_REQUEST,
        onStart: () => {},
        onFinish: () => {},
      });
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(body?.get("client_id")).toBe("device-client");
  });
});
