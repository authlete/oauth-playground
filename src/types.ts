export type StepId =
  | "discovery"
  | "client"
  | "dcr-register"
  | "federation-register"
  | "auth-request"
  | "par"
  | "authorize"
  | "token"
  | "ciba"
  | "device"
  | "inspect"
  | "userinfo"
  | "introspect"
  | "grant-management"
  | "resource"
  | "refresh"
  | "revoke";

// "hidden" steps are filtered from the rail entirely — used for the optional
// registration paths and PAR when the AS / user hasn't enabled them.
// "valid" is for config steps only: the inputs check out, but nothing was
// executed — rendered as a quiet dot, never a checkmark. "done" is reserved
// for steps where something actually happened (a request ran, a code arrived).
export type StepStatus =
  "locked" | "ready" | "active" | "valid" | "done" | "stale" | "hidden";

/** The rail is organised by what each thing actually is, not a flat 1→N list:
 *  - setup: establish the connection (which AS, which client)
 *  - get-token: obtain a token via the CHOSEN flow (one flow's steps at a time)
 *  - use-token / manage: things you do once you hold a token (a menu, any order)
 *  - tools: utilities with no prerequisites (the token inspector)
 * This matches the four different interaction patterns instead of pretending
 * alternatives and menus are sequential steps. */
export type StepPhase =
  "setup" | "get-token" | "use-token" | "manage" | "tools";

export interface PhaseDef {
  id: StepPhase;
  label: string;
}

export const STEP_PHASES: PhaseDef[] = [
  { id: "setup", label: "Connection" },
  { id: "get-token", label: "Get a token" },
  { id: "use-token", label: "Use the token" },
  { id: "manage", label: "Manage" },
  { id: "tools", label: "Tools" },
];

/** A token-acquisition flow. These are alternatives — you pick ONE — so they
 * are a choice in the rail's "Get a token" zone, not a stack of steps. Each is
 * offered only when the AS advertises its endpoint. */
export type Flow = "authorization-code" | "device" | "ciba";

export interface FlowDef {
  id: Flow;
  label: string;
  /** Discovery metadata field that must be present for this flow to be offered.
   * authorization-code uses the always-present authorization_endpoint. */
  endpoint: keyof OidcMetadata;
  /** Where the rail lands when this flow is selected. */
  entryStep: StepId;
}

export const FLOWS: FlowDef[] = [
  {
    id: "authorization-code",
    label: "Authorization Code",
    endpoint: "authorization_endpoint",
    entryStep: "auth-request",
  },
  {
    id: "device",
    label: "Device",
    endpoint: "device_authorization_endpoint",
    entryStep: "device",
  },
  {
    id: "ciba",
    label: "Backchannel (CIBA)",
    endpoint: "backchannel_authentication_endpoint",
    entryStep: "ciba",
  },
];

export interface StepDef {
  id: StepId;
  name: string;
  /** Lifecycle phase this step belongs to — drives the rail's grouping. */
  phase: StepPhase;
  /** For a get-token step, the flow it belongs to. Shown only when that flow
   * is the selected one. */
  flow?: Flow;
  /** Nested under the previous step in the rail (renders indented, with an
   * icon). Used for a true sub-step, e.g. PAR under Auth request. */
  nested?: boolean;
}

export const STEPS: StepDef[] = [
  { id: "discovery", name: "Discovery", phase: "setup" },
  { id: "client", name: "Client config", phase: "setup" },
  // DCR and Federation are client-identity methods shown inside the Client
  // step's "Other ways", not rail steps — kept here only so getStep/cascade
  // still resolve them; LeftRail filters them out of the rail.
  { id: "dcr-register", name: "Register client (DCR)", phase: "setup" },
  { id: "federation-register", name: "Federation register", phase: "setup" },

  // Get a token — one flow at a time. Authorization Code is a short sequence;
  // Device and CIBA are each a single step. All mint into the same token.
  {
    id: "auth-request",
    name: "Auth request",
    phase: "get-token",
    flow: "authorization-code",
  },
  // PAR only appears when the user enables it in Auth request's Extensions.
  {
    id: "par",
    name: "PAR push",
    phase: "get-token",
    flow: "authorization-code",
    nested: true,
  },
  {
    id: "authorize",
    name: "Authorize",
    phase: "get-token",
    flow: "authorization-code",
  },
  {
    id: "token",
    name: "Token exchange",
    phase: "get-token",
    flow: "authorization-code",
  },
  {
    id: "ciba",
    name: "Backchannel (CIBA)",
    phase: "get-token",
    flow: "ciba",
  },
  { id: "device", name: "Device flow", phase: "get-token", flow: "device" },

  // Use the token — a menu, any order, once a token exists.
  { id: "resource", name: "Resource call", phase: "use-token" },
  { id: "userinfo", name: "UserInfo", phase: "use-token" },
  { id: "introspect", name: "Introspection", phase: "use-token" },
  // Grant Management API — appears only when the AS advertises the endpoint.
  { id: "grant-management", name: "Grant management", phase: "use-token" },

  // Manage — refresh / revoke the token.
  { id: "refresh", name: "Refresh", phase: "manage" },
  { id: "revoke", name: "Revoke", phase: "manage" },

  // Tools — a utility with no prerequisites; decode any JWT, anytime.
  { id: "inspect", name: "Token inspector", phase: "tools" },
];

const STEP_BY_ID = new Map(STEPS.map((s) => [s.id, s]));

export function getStep(id: StepId): StepDef {
  return STEP_BY_ID.get(id)!;
}

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
  // CIMD (draft-ietf-oauth-client-id-metadata-document): the AS fetches a URL
  // client_id to resolve the client's metadata — registration-free identity.
  client_id_metadata_document_supported?: boolean;
  // RAR: the authorization_details `type`s the AS accepts.
  authorization_details_types_supported?: string[];
  // Grant Management: the API base for reading/revoking grants, the actions the
  // AS accepts on the authorize/PAR request, and whether an action is mandatory.
  grant_management_endpoint?: string;
  grant_management_actions_supported?: string[];
  grant_management_action_required?: boolean;
  // CIBA — the playground only drives `poll`.
  backchannel_authentication_endpoint?: string;
  backchannel_token_delivery_modes_supported?: string[];
  backchannel_user_code_parameter_supported?: boolean;
  // Device Authorization Grant (RFC 8628) — where the consumption device POSTs
  // to obtain a device_code / user_code pair.
  device_authorization_endpoint?: string;
  [key: string]: unknown;
}

export interface Jwks {
  keys: Array<{
    kid?: string;
    kty: string;
    alg?: string;
    use?: string;
    [k: string]: unknown;
  }>;
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
  mode: "wellknown" | "manual" | "resource";
  manual: ManualEndpoints;
}

// RFC 9728 OAuth 2.0 Protected Resource Metadata.
export interface PrmDocument {
  resource: string;
  authorization_servers?: string[];
  scopes_supported?: string[];
  bearer_methods_supported?: string[];
  resource_name?: string;
  resource_documentation?: string;
  [key: string]: unknown;
}

export type ResourceContextStatus = "idle" | "loading" | "success" | "error";

// One operation from the resource's OpenAPI document — enough to fill the
// Resource call request builder and tell the scope story per operation.
export interface ResourceOperation {
  method: HttpMethod;
  /** Templated path as documented, e.g. /api/accounts/{id}/balance. */
  path: string;
  /** Path with parameter examples substituted (falls back to the template
   * when the document has none) — what the Use button actually fills. */
  filledPath: string;
  summary?: string;
  scopes: string[];
  /** Pretty-printed JSON example for the request body, when the document
   * provides one. */
  requestBodyExample?: string;
}

// Set when the flow starts at a protected resource ("From resource" mode in
// Discovery). Downstream: Auth request derives the RFC 8707 resource param
// from it, and Resource call prefills its target.
export interface ResourceContextState {
  status: ResourceContextStatus;
  /** Resource URL as typed by the user. */
  url: string;
  metadataUrl?: string;
  prm?: PrmDocument;
  /** Send the RFC 8707 resource parameter in authorize/PAR/token requests. */
  indicatorEnabled: boolean;
  /** Operations advertised by the resource's OpenAPI document (probed at
   * {resource}/openapi.json after a PRM fetch; absent when it has none). */
  operations?: ResourceOperation[];
  errorMessage?: string;
  errorStatus?: number;
  errorBody?: string;
}

export const DEFAULT_RESOURCE_CONTEXT: ResourceContextState = {
  status: "idle",
  url: "",
  indicatorEnabled: true,
};

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
  "none" | "client_secret_basic" | "client_secret_post" | "private_key_jwt";

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
  // RFC 8707 resource indicator. Derived by the store from the resource
  // context (never persisted, never edited directly) — empty means "don't
  // send the parameter".
  resource: string;
  // Rich Authorization Requests: when enabled, `authorization_details` (raw
  // JSON text, edited directly) rides on authorize / PAR / token — and inside
  // the JAR request object when JAR is on. Off = parameter not sent.
  authorizationDetailsEnabled: boolean;
  authorizationDetails: string;
  // Grant Management: the action to take on the grant (create/update/replace/
  // merge). "" = don't send the parameter. grantId references an existing grant
  // for update/replace/merge; empty otherwise.
  grantManagementAction: string;
  grantId: string;
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
  resource: "",
  authorizationDetailsEnabled: false,
  authorizationDetails: "",
  grantManagementAction: "",
  grantId: "",
};

// Grant Management action values sent as the grant_management_action request
// parameter. query/revoke are not here — those are Grant Management API calls
// (GET/DELETE), gated by the grant_management_query / _revoke scopes, not
// request parameters.
export const GRANT_MANAGEMENT_ACTIONS = [
  "create",
  "update",
  "replace",
  "merge",
] as const;

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
  // Granted `authorization_details` echoed by the AS in the token response —
  // often narrowed/enriched vs. what was requested (identifiers filled in,
  // actions dropped). Undefined when the response carries none.
  authorizationDetails?: Array<Record<string, unknown>>;
  // Grant Management: the grant_id the AS bound this token to (present when the
  // request used grant_management_action). Anchors the Grant management step.
  grantId?: string;
  exchangedAt?: number;
  // Error response (RFC 6749 §5.2)
  error?: string;
  errorDescription?: string;
  errorBody?: string;
  errorStatus?: number;
}

export const DEFAULT_TOKEN: TokenState = { status: "idle" };

// CIBA, poll mode. login_hint / scopes / resource / authorization_details come
// from AuthRequestState; only CIBA-specific inputs and transaction state live
// here. Minted tokens are written into TokenState for downstream steps.
export type CibaStatus =
  | "idle"
  | "starting" // POSTing the backchannel authentication request
  | "pending" // polling; awaiting approval on the authentication device
  | "success"
  | "expired" // auth_req_id expired before approval
  | "denied" // user rejected on the authentication device
  | "error";

export interface CibaState {
  status: CibaStatus;
  bindingMessage: string;
  // requested_expiry (seconds); "" = don't send.
  requestedExpiry: string;
  authReqId?: string;
  expiresIn?: number;
  // Poll interval; `slow_down` bumps it by 5.
  interval?: number;
  startedAt?: number;
  pollCount?: number;
  lastResult?: "authorization_pending" | "slow_down";
  errorMessage?: string;
  errorStatus?: number;
  errorBody?: string;
}

export const DEFAULT_CIBA: CibaState = {
  status: "idle",
  bindingMessage: "",
  requestedExpiry: "",
};

// Device Authorization Grant (RFC 8628), the consumption-device side. scopes /
// resource / authorization_details come from AuthRequestState; only the device
// transaction state lives here. Minted tokens are written into TokenState for
// downstream steps, exactly like CIBA.
export type DeviceStatus =
  | "idle"
  | "starting" // POSTing the device authorization request
  | "pending" // polling; awaiting approval at the verification URI
  | "success"
  | "expired" // device_code expired before approval
  | "denied" // user rejected on the verification device
  | "error";

export interface DeviceState {
  status: DeviceStatus;
  // From the device authorization response (RFC 8628 §3.2).
  deviceCode?: string;
  userCode?: string;
  verificationUri?: string;
  // verification_uri_complete embeds the user_code so the second device can
  // skip typing it; optional — the AS may omit it.
  verificationUriComplete?: string;
  expiresIn?: number;
  // Poll interval; `slow_down` bumps it by 5.
  interval?: number;
  startedAt?: number;
  pollCount?: number;
  lastResult?: "authorization_pending" | "slow_down";
  errorMessage?: string;
  errorStatus?: number;
  errorBody?: string;
}

export const DEFAULT_DEVICE: DeviceState = { status: "idle" };

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
  /** Sent verbatim as the Authorization header — RFC 7662, Section 2.1
   * requires the introspection caller (typically the resource server) to
   * authenticate, separately from OAuth client auth. Defaults to a demo
   * value that satisfies test servers which only check the header exists. */
  callerAuthorization: string;
  result?: { active: boolean } & Record<string, unknown>;
  fetchedAt?: number;
  errorMessage?: string;
  errorStatus?: number;
  errorBody?: string;
}

export const DEFAULT_INTROSPECT: IntrospectState = {
  status: "idle",
  tokenSource: "access",
  callerAuthorization: "Bearer playground-demo-rs",
};

export type GrantManagementStatus = "idle" | "loading" | "success" | "error";

// The Grant Management API step: read (GET) or revoke (DELETE) the grant the
// current access token is bound to. Generic on what a grant contains — scopes,
// claims, authorization_details — so it works for scope-only grants too.
export interface GrantManagementState {
  status: GrantManagementStatus;
  lastAction?: "query" | "revoke";
  /** The grant document returned by a successful query. */
  grant?: { scopes?: unknown; authorization_details?: unknown } & Record<
    string,
    unknown
  >;
  /** Set once a revoke succeeds — downstream token ops are expected to fail. */
  revoked?: boolean;
  fetchedAt?: number;
  errorMessage?: string;
  errorStatus?: number;
  errorBody?: string;
}

export const DEFAULT_GRANT_MANAGEMENT: GrantManagementState = {
  status: "idle",
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

// Dynamic Client Registration (RFC 7591). Shown when discovery advertises a
// `registration_endpoint`. The form is a subset of client metadata; the AS
// echoes it back plus the issued credentials and RFC 7592 management fields.
export type DcrRegisterStatus = "idle" | "loading" | "success" | "error";

export interface DcrRegisteredClient {
  clientId: string;
  clientSecret?: string;
  clientSecretExpiresAt?: number; // 0 = never expires
  clientIdIssuedAt?: number;
  registrationAccessToken?: string;
  registrationClientUri?: string;
  raw: Record<string, unknown>;
}

export interface DcrRegisterState {
  status: DcrRegisterStatus;
  clientName: string;
  redirectUris: string; // one URI per line
  tokenEndpointAuthMethod: ClientAuthMethod;
  grantTypes: string[];
  scope: string;
  // RAR: the authorization_details `type`s this client is allowed to use.
  // Registered as the `authorization_details_types` client metadata — without
  // it the AS rejects RAR requests for types the client never registered.
  authorizationDetailsTypes: string[];
  result?: DcrRegisteredClient;
  registeredAt?: number;
  errorMessage?: string;
  errorStatus?: number;
  errorBody?: string;
}

export const DEFAULT_DCR_REGISTER: DcrRegisterState = {
  status: "idle",
  clientName: "OAuth Playground",
  redirectUris: "",
  tokenEndpointAuthMethod: "none",
  grantTypes: ["authorization_code", "refresh_token"],
  scope: "openid profile email",
  authorizationDetailsTypes: [],
};

export const DCR_GRANT_TYPES = [
  "authorization_code",
  "refresh_token",
  "client_credentials",
  "urn:openid:params:grant-type:ciba",
  "urn:ietf:params:oauth:grant-type:device_code",
] as const;

export type FederationRegisterMode = "entity-config" | "trust-chain";

export type FederationRegisterStatus = "idle" | "loading" | "success" | "error";

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
