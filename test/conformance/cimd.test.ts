// CIMD — the playground's own Client ID Metadata Document must satisfy the
// draft's rules on the document it serves.

import { describe, expect, test } from "vitest";
import {
  buildClientMetadata,
  clientMetadataUrl,
} from "../../src/protocol/cimd";

describe("CIMD document", () => {
  const origin = "https://playground.example";

  test("cimd.client-id-matches: document client_id equals its URL", () => {
    const doc = buildClientMetadata(origin);
    expect(doc.client_id).toBe(clientMetadataUrl(origin));
  });

  test("cimd.no-secret: no client_secret or symmetric credential", () => {
    const doc = buildClientMetadata(origin);
    const json = JSON.stringify(doc).toLowerCase();
    expect(json).not.toContain("secret");
    expect(doc.token_endpoint_auth_method).toBe("none");
  });

  test("cimd.url-shape: client_id URL has a path and no fragment", () => {
    const u = new URL(clientMetadataUrl(origin));
    expect(u.pathname.length).toBeGreaterThan(1);
    expect(u.hash).toBe("");
  });
});
