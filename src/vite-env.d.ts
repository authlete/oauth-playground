/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Comma-separated authorization-server issuer URLs; first = default. */
  readonly VITE_AUTH_SERVERS?: string;
}
