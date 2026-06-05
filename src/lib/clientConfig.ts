import type { ClientConfigState } from "../types";

export type ClientConfigValidation =
  | { ok: true }
  | { ok: false; message: string };

export function validateClientConfig(
  cfg: ClientConfigState,
): ClientConfigValidation {
  if (!cfg.clientId.trim()) {
    return { ok: false, message: "Client ID is required." };
  }
  if (!cfg.redirectUri.trim()) {
    return { ok: false, message: "Redirect URI is required." };
  }
  try {
    const u = new URL(cfg.redirectUri);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { ok: false, message: "Redirect URI must be http(s)." };
    }
  } catch {
    return { ok: false, message: "Redirect URI must be an absolute URL." };
  }
  if (
    (cfg.authMethod === "client_secret_basic" ||
      cfg.authMethod === "client_secret_post") &&
    !cfg.clientSecret
  ) {
    return { ok: false, message: "Client secret is required for this method." };
  }
  if (
    cfg.authMethod === "private_key_jwt" &&
    cfg.privateKey.status !== "valid"
  ) {
    return {
      ok: false,
      message: "Paste a valid private JWK to use private_key_jwt.",
    };
  }
  return { ok: true };
}
