// Preset protected resources for Discovery's "From resource" mode. Set per
// deployment via VITE_RESOURCE_SERVERS (comma-separated resource URLs); the
// FIRST entry is the default. Unset → local-dev fallback.

const FALLBACK = "http://localhost:8090";

function parse(raw: string | undefined): string[] {
  const list = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : [FALLBACK];
}

export const RESOURCE_SERVERS: string[] = parse(
  import.meta.env.VITE_RESOURCE_SERVERS,
);
export const DEFAULT_RESOURCE_SERVER = RESOURCE_SERVERS[0];
