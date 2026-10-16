// RFC 6750, Section 3: parse a WWW-Authenticate Bearer challenge so the
// Resource call step can explain 401/403 responses and offer the
// insufficient_scope step-up.

export interface BearerChallenge {
  /** auth-params from the challenge: error, error_description, scope,
   * resource_metadata (RFC 9728), realm, … */
  params: Record<string, string>;
}

export function parseBearerChallenge(
  header: string | undefined,
): BearerChallenge | null {
  if (!header) return null;
  const match = /^\s*Bearer\b(.*)$/i.exec(header);
  if (!match) return null;
  const params: Record<string, string> = {};
  // key="quoted value" or key=token, comma-separated.
  const paramRe = /([a-zA-Z0-9_]+)\s*=\s*(?:"([^"]*)"|([^\s,]+))/g;
  let m: RegExpExecArray | null;
  while ((m = paramRe.exec(match[1])) !== null) {
    params[m[1].toLowerCase()] = m[2] ?? m[3] ?? "";
  }
  return { params };
}
