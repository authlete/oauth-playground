export type StepId =
  | "discovery"
  | "client"
  | "federation-register"
  | "auth-request"
  | "par"
  | "authorize"
  | "token"
  | "inspect"
  | "userinfo"
  | "introspect"
  | "resource"
  | "refresh"
  | "revoke";

// "hidden" steps are filtered from the rail entirely — used for federation
// registration when the AS doesn't advertise the endpoint.
export type StepStatus =
  | "locked"
  | "ready"
  | "active"
  | "done"
  | "stale"
  | "hidden";

export interface StepDef {
  id: StepId;
  /** Sequential number. Omitted for auxiliary / nested steps that aren't on
   * the main 1→12 path. */
  number?: number;
  name: string;
  /** Nested under the previous step in the rail (renders indented, no
   * number, with an icon). Used for optional / out-of-sequence paths. */
  nested?: boolean;
}

export const STEPS: StepDef[] = [
  { id: "discovery", number: 1, name: "Discovery" },
  { id: "client", number: 2, name: "Client config" },
  // Auxiliary path under Client: visible only when the AS advertises a
  // federation_registration_endpoint. Nested + numberless so it reads as an
  // optional branch off step 2 rather than an inline step.
  { id: "federation-register", name: "Federation register", nested: true },
  { id: "auth-request", number: 3, name: "Auth request" },
  { id: "par", number: 4, name: "PAR" },
  { id: "authorize", number: 5, name: "Authorize" },
  { id: "token", number: 6, name: "Token exchange" },
  { id: "inspect", number: 7, name: "Token inspector" },
  { id: "userinfo", number: 8, name: "UserInfo" },
  { id: "introspect", number: 9, name: "Introspection" },
  { id: "resource", number: 10, name: "Resource call" },
  { id: "refresh", number: 11, name: "Refresh" },
  { id: "revoke", number: 12, name: "Revoke" },
];

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD";

export interface NetworkEntry {
  id: string;
  startedAt: number;
  finishedAt?: number;
  method: HttpMethod;
  url: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  status?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  durationMs?: number;
  errorMessage?: string;
}

export type DiscoveryStatus =
  | "idle"
  | "loading"
  | "success"
  | "cors-error"
  | "http-error"
  | "network-error"
  | "malformed"
  | "partial";

export interface OidcMetadata {
  issuer: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  jwks_uri?: string;
  userinfo_endpoint?: string;
  introspection_endpoint?: string;
  revocation_endpoint?: string;
  registration_endpoint?: string;
  pushed_authorization_request_endpoint?: string;
  federation_registration_endpoint?: string;
  [key: string]: unknown;
}

export interface Jwks {
  keys: Array<{ kid?: string; kty: string; alg?: string; use?: string; [k: string]: unknown }>;
}

export interface DiscoveryState {
  status: DiscoveryStatus;
  issuer: string;
  metadata?: OidcMetadata;
  jwks?: Jwks;
  errorMessage?: string;
  errorBody?: string;
  errorStatus?: number;
  durationMs?: number;
  mode: "wellknown" | "manual";
  manual: ManualEndpoints;
}

export interface ManualEndpoints {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint: string;
  introspection_endpoint: string;
  revocation_endpoint: string;
  pushed_authorization_request_endpoint: string;
  federation_registration_endpoint: string;
}

export const EMPTY_MANUAL_ENDPOINTS: ManualEndpoints = {
  issuer: "",
  authorization_endpoint: "",
  token_endpoint: "",
  jwks_uri: "",
  userinfo_endpoint: "",
  introspection_endpoint: "",
  revocation_endpoint: "",
  pushed_authorization_request_endpoint: "",
  federation_registration_endpoint: "",
};

export type ClientAuthMethod =
  | "none"
  | "client_secret_basic"
  | "client_secret_post"
  | "private_key_jwt";

export interface PrivateKeyState {
  jwkText: string;
  status: "empty" | "valid" | "invalid";
  alg?: string;
  kid?: string;
  errorMessage?: string;
}

export interface ClientConfigState {
  clientId: string;
  authMethod: ClientAuthMethod;
  clientSecret: string;
  redirectUri: string;
  privateKey: PrivateKeyState;
}

export const DEFAULT_CLIENT_CONFIG: ClientConfigState = {
  clientId: "2234376661",
  authMethod: "none",
  clientSecret: "",
  redirectUri: "",
  privateKey: { jwkText: "", status: "empty" },
};

export type ResponseMode = "query" | "fragment" | "form_post";

export interface AuthRequestState {
  scopes: string[];
  customScope: string;
  responseType: string;
  responseMode: ResponseMode;
  pkceEnabled: boolean;
  state: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
  // JAR (RFC 9101): wrap the authorization request parameters in a signed JWT
  // ("request object"), signed with the step-2 private JWK.
  jarEnabled: boolean;
  // Live-signed request object — derived (like codeChallenge), held in memory,
  // never persisted. The store re-signs this whenever the params or key change;
  // steps 3/4/5 all read this one value (single source of truth for JAR).
  requestObjectJwt?: string;
  requestObjectError?: string;
  prompt: string;
  loginHint: string;
  maxAge: string;
  // OpenID Federation: a JSON array of signed-JWT strings (RP entity statement,
  // intermediates, Trust Anchor entity configuration). Sent verbatim as the
  // value of the `trust_chain` request parameter.
  trustChain: string;
}

export const COMMON_SCOPES = [
  "openid",
  "profile",
  "email",
  "address",
  "phone",
  "offline_access",
] as const;

export const DEFAULT_AUTH_REQUEST: AuthRequestState = {
  scopes: ["openid", "profile", "email"],
  customScope: "",
  responseType: "code",
  responseMode: "query",
  pkceEnabled: true,
  state: "",
  nonce: "",
  codeVerifier: "",
  codeChallenge: "",
  jarEnabled: false,
  prompt: "",
  loginHint: "",
  maxAge: "",
  trustChain: "",
};

export type AuthorizeStatus = "idle" | "waiting" | "received" | "error";

export interface AuthorizeState {
  status: AuthorizeStatus;
  code?: string;
  returnedState?: string;
  iss?: string;
  stateMatches?: boolean;
  issMatches?: boolean;
  error?: string;
  errorDescription?: string;
  errorUri?: string;
  rawCallbackUrl?: string;
  receivedAt?: number;
  // The exact authorize URL that was opened (for retries / display).
  openedUrl?: string;
}

export const DEFAULT_AUTHORIZE: AuthorizeState = { status: "idle" };

export type ParStatus = "idle" | "loading" | "success" | "error";

export interface ParState {
  status: ParStatus;
  enabled: boolean;
  requestUri?: string;
  expiresIn?: number;
  pushedAt?: number;
  errorMessage?: string;
  errorStatus?: number;
  errorBody?: string;
}

export const DEFAULT_PAR: ParState = { status: "idle", enabled: false };

export type TokenStatus = "idle" | "loading" | "success" | "error";

export interface TokenState {
  status: TokenStatus;
  accessToken?: string;
  tokenType?: string;
  expiresIn?: number;
  expiresAt?: number;
  refreshToken?: string;
  idToken?: string;
  scope?: string;
  exchangedAt?: number;
  // Error response (RFC 6749 §5.2)
  error?: string;
  errorDescription?: string;
  errorBody?: string;
  errorStatus?: number;
}

export const DEFAULT_TOKEN: TokenState = { status: "idle" };

export type InspectorSource = "access" | "id" | "refresh" | "paste";

export interface InspectorState {
  source: InspectorSource;
  pastedText: string;
}

export const DEFAULT_INSPECTOR: InspectorState = {
  source: "id",
  pastedText: "",
};

export type UserInfoStatus = "idle" | "loading" | "success" | "error";

export interface UserInfoState {
  status: UserInfoStatus;
  claims?: Record<string, unknown>;
  fetchedAt?: number;
  errorMessage?: string;
  errorStatus?: number;
  errorBody?: string;
}

export const DEFAULT_USERINFO: UserInfoState = { status: "idle" };

export type IntrospectStatus = "idle" | "loading" | "success" | "error";

export interface IntrospectState {
  status: IntrospectStatus;
  tokenSource: "access" | "refresh";
  result?: { active: boolean } & Record<string, unknown>;
  fetchedAt?: number;
  errorMessage?: string;
  errorStatus?: number;
  errorBody?: string;
}

export const DEFAULT_INTROSPECT: IntrospectState = {
  status: "idle",
  tokenSource: "access",
};

export type ResourceCallStatus = "idle" | "loading" | "success" | "error";

export interface ResourceCallState {
  status: ResourceCallStatus;
  url: string;
  method: string;
  headersText: string;
  bodyText: string;
  attachBearer: boolean;
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    durationMs: number;
  };
  errorMessage?: string;
}

export const DEFAULT_RESOURCE_CALL: ResourceCallState = {
  status: "idle",
  url: "",
  method: "GET",
  headersText: "",
  bodyText: "",
  attachBearer: true,
};

export type RefreshStatus = "idle" | "loading" | "success" | "error";

export interface RefreshState {
  status: RefreshStatus;
  downscope: string;
  refreshedAt?: number;
  errorMessage?: string;
  errorStatus?: number;
  errorBody?: string;
}

export const DEFAULT_REFRESH: RefreshState = { status: "idle", downscope: "" };

export type RevokeStatus = "idle" | "loading" | "success" | "error";

export interface RevokeState {
  status: RevokeStatus;
  tokenSource: "access" | "refresh";
  lastRevokedKind?: "access" | "refresh";
  revokedAt?: number;
  errorMessage?: string;
  errorStatus?: number;
  errorBody?: string;
}

export const DEFAULT_REVOKE: RevokeState = {
  status: "idle",
  tokenSource: "access",
};

export type FederationRegisterMode = "entity-config" | "trust-chain";

export type FederationRegisterStatus =
  | "idle"
  | "loading"
  | "success"
  | "error";

export interface FederationRegisterState {
  status: FederationRegisterStatus;
  mode: FederationRegisterMode;
  // Raw textarea contents — an entity-configuration JWT or a JSON array of JWTs.
  payload: string;
  // Signed entity statement returned by the AS on success.
  responseJwt?: string;
  // Convenience: client_id parsed from the response (the `sub` claim).
  issuedClientId?: string;
  registeredAt?: number;
  errorMessage?: string;
  errorStatus?: number;
  errorBody?: string;
}

export const DEFAULT_FEDERATION_REGISTER: FederationRegisterState = {
  status: "idle",
  mode: "entity-config",
  payload: "",
};
