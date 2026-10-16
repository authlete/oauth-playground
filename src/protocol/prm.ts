// RFC 9728 OAuth 2.0 Protected Resource Metadata: fetch and validate the
// /.well-known/oauth-protected-resource document so a flow can start at the
// resource and discover its authorization server(s) from there.

import { runFetch, type DiscoveryError } from "./discovery";
import type { NetworkEntry, PrmDocument } from "../types";

export type PrmFetchResult =
  | { ok: true; prm: PrmDocument; metadataUrl: string; durationMs: number }
  | { ok: false; error: DiscoveryError; durationMs: number };

/** Well-known URL per RFC 9728, Section 3.1: the path component of the
 * resource identifier is appended AFTER the well-known segment
 * (https://host/.well-known/oauth-protected-resource/path). */
export function prmMetadataUrl(resourceInput: string): string | null {
  const trimmed = resourceInput.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const path = url.pathname === "/" ? "" : url.pathname;
  return `${url.origin}/.well-known/oauth-protected-resource${path}`;
}

export async function fetchPrm(
  resourceInput: string,
  callbacks: {
    onStart: (entry: NetworkEntry) => void;
    onFinish: (id: string, patch: Partial<NetworkEntry>) => void;
  },
): Promise<PrmFetchResult> {
  const startedAt = performance.now();
  const metadataUrl = prmMetadataUrl(resourceInput);
  if (!metadataUrl) {
    return {
      ok: false,
      error: {
        kind: "invalid-url",
        message:
          "Resource must be an absolute http:// or https:// URL (e.g. http://localhost:8090).",
      },
      durationMs: 0,
    };
  }

  const result = await runFetch({
    method: "GET",
    url: metadataUrl,
    ...callbacks,
  });
  const durationMs = Math.round(performance.now() - startedAt);
  if (!result.ok) {
    return { ok: false, error: result.error, durationMs };
  }

  let prm: PrmDocument;
  try {
    prm = JSON.parse(result.body) as PrmDocument;
  } catch {
    return {
      ok: false,
      error: {
        kind: "malformed",
        missing: ["valid JSON"],
        raw: result.body.slice(0, 4000),
      },
      durationMs,
    };
  }

  const missing: string[] = [];
  if (typeof prm.resource !== "string") missing.push("resource");
  if (
    !Array.isArray(prm.authorization_servers) ||
    prm.authorization_servers.length === 0 ||
    prm.authorization_servers.some((s) => typeof s !== "string")
  ) {
    // Optional per spec, but without it the flow has nowhere to go.
    missing.push("authorization_servers");
  }
  if (missing.length > 0) {
    return {
      ok: false,
      error: { kind: "malformed", missing, raw: result.body.slice(0, 4000) },
      durationMs,
    };
  }

  return { ok: true, prm, metadataUrl, durationMs };
}
