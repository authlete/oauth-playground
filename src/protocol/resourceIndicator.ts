// RFC 8707 Resource Indicators. The `resource` parameter can repeat on the
// authorization and token requests; each value MUST be an absolute URI with no
// fragment. These helpers are the single source of truth for what goes on the
// wire and for the inline validation the UI shows.

/** Trim and drop blanks — the list of `resource` values to actually send. */
export function resourceValues(resources: string[]): string[] {
  return resources.map((r) => r.trim()).filter(Boolean);
}

/**
 * Why a resource indicator is not a valid RFC 8707 value, or null if it is.
 * Absolute URI, no fragment; a query component is discouraged but allowed.
 */
export function resourceError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return "Must be an absolute URI.";
  }
  if (!url.protocol) return "Must be an absolute URI.";
  if (v.includes("#")) return "Must not include a fragment (#…).";
  return null;
}
