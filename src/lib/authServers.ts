// Preset authorization servers for the Discovery picker. Set per deployment via
// VITE_AUTH_SERVERS (comma-separated issuer URLs); the FIRST entry is the
// default selection. Unset → local-dev fallback.

const FALLBACK = "http://localhost:3000";

function parse(raw: string | undefined): string[] {
  const list = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : [FALLBACK];
}

export const AUTH_SERVERS: string[] = parse(import.meta.env.VITE_AUTH_SERVERS);
export const DEFAULT_AUTH_SERVER = AUTH_SERVERS[0];
