import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { computeStepStatuses } from "../protocol/stepCascade";
import {
  exchangeCode,
  tokenStatePatchFromResult,
} from "../protocol/tokenExchange";
import { DEFAULT_AUTH_SERVER } from "../protocol/authServers";
import { buildAuthorizeParams } from "../protocol/authorizeUrl";
import { signRequestObject } from "../protocol/requestObject";
import { computeCodeChallenge, generateCodeVerifier } from "../protocol/pkce";
import { randomBase64Url } from "../protocol/random";
import {
  clearShareFromUrl,
  readShareFromUrl,
  type SharePayload,
} from "../protocol/shareConfig";
import {
  DEFAULT_AUTHORIZE,
  DEFAULT_AUTH_REQUEST,
  DEFAULT_CIBA,
  DEFAULT_DEVICE,
  DEFAULT_CLIENT_CONFIG,
  DEFAULT_DCR_REGISTER,
  DEFAULT_FEDERATION_REGISTER,
  DEFAULT_GRANT_MANAGEMENT,
  DEFAULT_INSPECTOR,
  DEFAULT_INTROSPECT,
  DEFAULT_PAR,
  DEFAULT_REFRESH,
  DEFAULT_RESOURCE_CALL,
  DEFAULT_RESOURCE_CONTEXT,
  DEFAULT_REVOKE,
  DEFAULT_TOKEN,
  DEFAULT_USERINFO,
  EMPTY_MANUAL_ENDPOINTS,
  FLOWS,
  type Flow,
  type AuthRequestState,
  type AuthorizeState,
  type CibaState,
  type DeviceState,
  type ClientConfigState,
  type DcrRegisterState,
  type DiscoveryState,
  type FederationRegisterState,
  type GrantManagementState,
  type InspectorState,
  type IntrospectState,
  type ManualEndpoints,
  type NetworkEntry,
  type ParState,
  type RefreshState,
  type ResourceCallState,
  type ResourceContextState,
  type RevokeState,
  type StepId,
  type StepStatus,
  type TokenState,
  type UserInfoState,
} from "../types";

interface State {
  theme: "dark" | "light";
  activeStep: StepId;
  stepStatus: Record<StepId, StepStatus>;
  network: NetworkEntry[];
  /** Right-pane visibility. Starts collapsed; auto-expands on first request. */
  networkCollapsed: boolean;
  /** When on, a received authorization code is traded for tokens in the
   * background — without stealing focus from the authorization result, which
   * is the part worth studying. Off = inspect the code, exchange by hand. */
  autoExchange: boolean;
  /** The selected token-acquisition flow. Drives which get-token steps show. */
  flow: Flow;
  discovery: DiscoveryState;
  /** RFC 9728 context when the flow started at a protected resource. */
  resource: ResourceContextState;
  client: ClientConfigState;
  dcrRegister: DcrRegisterState;
  federationRegister: FederationRegisterState;
  authRequest: AuthRequestState;
  par: ParState;
  authorize: AuthorizeState;
  token: TokenState;
  ciba: CibaState;
  device: DeviceState;
  inspector: InspectorState;
  userInfo: UserInfoState;
  introspect: IntrospectState;
  grantManagement: GrantManagementState;
  resourceCall: ResourceCallState;
  refresh: RefreshState;
  revoke: RevokeState;
}

type Action =
  | { type: "set-theme"; theme: "dark" | "light" }
  | { type: "set-active-step"; step: StepId }
  | { type: "set-step-status"; step: StepId; status: StepStatus }
  | { type: "network-add"; entry: NetworkEntry }
  | { type: "network-update"; id: string; patch: Partial<NetworkEntry> }
  | { type: "network-clear" }
  | { type: "network-set-collapsed"; collapsed: boolean }
  | { type: "set-auto-exchange"; value: boolean }
  | { type: "set-flow"; flow: Flow }
  | { type: "discovery-update"; patch: Partial<DiscoveryState> }
  | { type: "discovery-reset" }
  | { type: "resource-update"; patch: Partial<ResourceContextState> }
  | { type: "client-update"; patch: Partial<ClientConfigState> }
  | { type: "dcr-register-update"; patch: Partial<DcrRegisterState> }
  | {
      type: "federation-register-update";
      patch: Partial<FederationRegisterState>;
    }
  | { type: "auth-request-update"; patch: Partial<AuthRequestState> }
  | { type: "par-update"; patch: Partial<ParState> }
  | { type: "authorize-update"; patch: Partial<AuthorizeState> }
  | { type: "token-update"; patch: Partial<TokenState> }
  | { type: "ciba-update"; patch: Partial<CibaState> }
  | { type: "ciba-reset" }
  | { type: "device-update"; patch: Partial<DeviceState> }
  | { type: "device-reset" }
  | { type: "inspector-update"; patch: Partial<InspectorState> }
  | { type: "userinfo-update"; patch: Partial<UserInfoState> }
  | { type: "introspect-update"; patch: Partial<IntrospectState> }
  | {
      type: "grant-management-update";
      patch: Partial<GrantManagementState>;
    }
  | { type: "grant-management-reset" }
  | { type: "resource-call-update"; patch: Partial<ResourceCallState> }
  | { type: "refresh-update"; patch: Partial<RefreshState> }
  | { type: "revoke-update"; patch: Partial<RevokeState> };

const CLIENT_PERSIST_KEY = "playground.client";
const AUTH_REQUEST_PERSIST_KEY = "playground.authRequest";
const DISCOVERY_MODE_PERSIST_KEY = "playground.discoveryMode";
const MANUAL_ENDPOINTS_PERSIST_KEY = "playground.manualEndpoints";

interface PersistedClient {
  clientId: string;
  authMethod: ClientConfigState["authMethod"];
  redirectUri: string;
}

function loadPersistedClient(): PersistedClient | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CLIENT_PERSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedClient;
    if (
      typeof parsed.clientId === "string" &&
      typeof parsed.authMethod === "string" &&
      typeof parsed.redirectUri === "string"
    ) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

function persistClient(state: ClientConfigState) {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedClient = {
      clientId: state.clientId,
      authMethod: state.authMethod,
      redirectUri: state.redirectUri,
    };
    window.localStorage.setItem(CLIENT_PERSIST_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

interface PersistedAuthRequest {
  scopes: string[];
  customScope: string;
  responseType: string;
  responseMode: AuthRequestState["responseMode"];
  pkceEnabled: boolean;
  jarEnabled: boolean;
  prompt: string;
  loginHint: string;
  maxAge: string;
  authorizationDetailsEnabled?: boolean;
  authorizationDetails?: string;
}

function loadPersistedAuthRequest(): PersistedAuthRequest | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_REQUEST_PERSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedAuthRequest;
    if (Array.isArray(parsed.scopes)) return parsed;
  } catch {
    // ignore
  }
  return null;
}

function loadPersistedDiscoveryMode():
  "wellknown" | "manual" | "resource" | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(DISCOVERY_MODE_PERSIST_KEY);
  return raw === "manual" || raw === "wellknown" || raw === "resource"
    ? raw
    : null;
}

function loadPersistedManualEndpoints(): ManualEndpoints | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MANUAL_ENDPOINTS_PERSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ManualEndpoints>;
    return { ...EMPTY_MANUAL_ENDPOINTS, ...parsed };
  } catch {
    return null;
  }
}

function persistDiscovery(
  mode: DiscoveryState["mode"],
  manual: ManualEndpoints,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISCOVERY_MODE_PERSIST_KEY, mode);
    window.localStorage.setItem(
      MANUAL_ENDPOINTS_PERSIST_KEY,
      JSON.stringify(manual),
    );
  } catch {
    // ignore
  }
}

function persistAuthRequest(state: AuthRequestState) {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedAuthRequest = {
      scopes: state.scopes,
      customScope: state.customScope,
      responseType: state.responseType,
      responseMode: state.responseMode,
      pkceEnabled: state.pkceEnabled,
      jarEnabled: state.jarEnabled,
      prompt: state.prompt,
      loginHint: state.loginHint,
      maxAge: state.maxAge,
      authorizationDetailsEnabled: state.authorizationDetailsEnabled,
      authorizationDetails: state.authorizationDetails,
    };
    window.localStorage.setItem(
      AUTH_REQUEST_PERSIST_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // ignore
  }
}

const initialState: State = {
  theme: "dark",
  activeStep: "discovery",
  stepStatus: {
    discovery: "active",
    client: "locked",
    "dcr-register": "hidden",
    "federation-register": "hidden",
    "auth-request": "locked",
    par: "hidden",
    authorize: "locked",
    token: "locked",
    ciba: "hidden",
    device: "hidden",
    inspect: "locked",
    userinfo: "locked",
    introspect: "locked",
    "grant-management": "hidden",
    resource: "locked",
    refresh: "locked",
    revoke: "locked",
  },
  network: [],
  networkCollapsed: true,
  autoExchange: true,
  flow: "authorization-code",
  discovery: {
    status: "idle",
    issuer: DEFAULT_AUTH_SERVER,
    mode: "wellknown",
    manual: { ...EMPTY_MANUAL_ENDPOINTS },
  },
  resource: DEFAULT_RESOURCE_CONTEXT,
  client: DEFAULT_CLIENT_CONFIG,
  dcrRegister: DEFAULT_DCR_REGISTER,
  federationRegister: DEFAULT_FEDERATION_REGISTER,
  authRequest: DEFAULT_AUTH_REQUEST,
  par: DEFAULT_PAR,
  authorize: DEFAULT_AUTHORIZE,
  token: DEFAULT_TOKEN,
  ciba: DEFAULT_CIBA,
  device: DEFAULT_DEVICE,
  inspector: DEFAULT_INSPECTOR,
  userInfo: DEFAULT_USERINFO,
  introspect: DEFAULT_INTROSPECT,
  grantManagement: DEFAULT_GRANT_MANAGEMENT,
  resourceCall: DEFAULT_RESOURCE_CALL,
  refresh: DEFAULT_REFRESH,
  revoke: DEFAULT_REVOKE,
};

function defaultRedirectUri(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/callback`;
}

function applyShareToAuthRequest(share: SharePayload | null) {
  if (!share) return {};
  const out: Record<string, unknown> = {};
  if (share.scopes) out.scopes = share.scopes;
  if (share.customScope !== undefined) out.customScope = share.customScope;
  if (share.responseType) out.responseType = share.responseType;
  if (share.responseMode) out.responseMode = share.responseMode;
  if (typeof share.pkce === "boolean") out.pkceEnabled = share.pkce;
  if (typeof share.jar === "boolean") out.jarEnabled = share.jar;
  if (share.prompt !== undefined) out.prompt = share.prompt;
  if (share.loginHint !== undefined) out.loginHint = share.loginHint;
  if (share.maxAge !== undefined) out.maxAge = share.maxAge;
  return out;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "set-theme":
      return { ...state, theme: action.theme };
    case "set-active-step":
      return { ...state, activeStep: action.step };
    case "set-step-status":
      return {
        ...state,
        stepStatus: { ...state.stepStatus, [action.step]: action.status },
      };
    case "network-add":
      // First traffic opens the pane — after that the user's choice wins.
      return {
        ...state,
        network: [...state.network, action.entry],
        networkCollapsed:
          state.network.length === 0 ? false : state.networkCollapsed,
      };
    case "network-update":
      return {
        ...state,
        network: state.network.map((e) =>
          e.id === action.id ? { ...e, ...action.patch } : e,
        ),
      };
    case "network-clear":
      return { ...state, network: [] };
    case "network-set-collapsed":
      return { ...state, networkCollapsed: action.collapsed };
    case "set-auto-exchange":
      return { ...state, autoExchange: action.value };
    case "set-flow": {
      // Switching flow lands on that flow's entry step so focus follows intent.
      const entry = FLOWS.find((f) => f.id === action.flow)?.entryStep;
      return {
        ...state,
        flow: action.flow,
        activeStep: entry ?? state.activeStep,
      };
    }
    case "discovery-update":
      return { ...state, discovery: { ...state.discovery, ...action.patch } };
    case "resource-update":
      return { ...state, resource: { ...state.resource, ...action.patch } };
    case "discovery-reset":
      return {
        ...state,
        discovery: {
          status: "idle",
          issuer: state.discovery.issuer,
          mode: state.discovery.mode,
          manual: state.discovery.manual,
        },
      };
    case "client-update":
      return { ...state, client: { ...state.client, ...action.patch } };
    case "dcr-register-update":
      return {
        ...state,
        dcrRegister: { ...state.dcrRegister, ...action.patch },
      };
    case "federation-register-update":
      return {
        ...state,
        federationRegister: { ...state.federationRegister, ...action.patch },
      };
    case "auth-request-update":
      return {
        ...state,
        authRequest: { ...state.authRequest, ...action.patch },
      };
    case "par-update":
      return { ...state, par: { ...state.par, ...action.patch } };
    case "authorize-update":
      return { ...state, authorize: { ...state.authorize, ...action.patch } };
    case "token-update":
      return { ...state, token: { ...state.token, ...action.patch } };
    case "ciba-update":
      return { ...state, ciba: { ...state.ciba, ...action.patch } };
    case "ciba-reset":
      return { ...state, ciba: DEFAULT_CIBA };
    case "device-update":
      return { ...state, device: { ...state.device, ...action.patch } };
    case "device-reset":
      return { ...state, device: DEFAULT_DEVICE };
    case "inspector-update":
      return { ...state, inspector: { ...state.inspector, ...action.patch } };
    case "userinfo-update":
      return { ...state, userInfo: { ...state.userInfo, ...action.patch } };
    case "introspect-update":
      return { ...state, introspect: { ...state.introspect, ...action.patch } };
    case "grant-management-update":
      return {
        ...state,
        grantManagement: { ...state.grantManagement, ...action.patch },
      };
    case "grant-management-reset":
      return { ...state, grantManagement: DEFAULT_GRANT_MANAGEMENT };
    case "resource-call-update":
      return {
        ...state,
        resourceCall: { ...state.resourceCall, ...action.patch },
      };
    case "refresh-update":
      return { ...state, refresh: { ...state.refresh, ...action.patch } };
    case "revoke-update":
      return { ...state, revoke: { ...state.revoke, ...action.patch } };
  }
}

interface PlaygroundContextValue {
  state: State;
  setTheme: (theme: "dark" | "light") => void;
  toggleTheme: () => void;
  setActiveStep: (step: StepId) => void;
  setStepStatus: (step: StepId, status: StepStatus) => void;
  networkAdd: (entry: NetworkEntry) => void;
  networkUpdate: (id: string, patch: Partial<NetworkEntry>) => void;
  networkClear: () => void;
  networkSetCollapsed: (collapsed: boolean) => void;
  setAutoExchange: (value: boolean) => void;
  setFlow: (flow: Flow) => void;
  discoveryUpdate: (patch: Partial<DiscoveryState>) => void;
  discoveryReset: () => void;
  resourceUpdate: (patch: Partial<ResourceContextState>) => void;
  clientUpdate: (patch: Partial<ClientConfigState>) => void;
  dcrRegisterUpdate: (patch: Partial<DcrRegisterState>) => void;
  federationRegisterUpdate: (patch: Partial<FederationRegisterState>) => void;
  authRequestUpdate: (patch: Partial<AuthRequestState>) => void;
  parUpdate: (patch: Partial<ParState>) => void;
  authorizeUpdate: (patch: Partial<AuthorizeState>) => void;
  tokenUpdate: (patch: Partial<TokenState>) => void;
  cibaUpdate: (patch: Partial<CibaState>) => void;
  cibaReset: () => void;
  deviceUpdate: (patch: Partial<DeviceState>) => void;
  deviceReset: () => void;
  inspectorUpdate: (patch: Partial<InspectorState>) => void;
  userInfoUpdate: (patch: Partial<UserInfoState>) => void;
  introspectUpdate: (patch: Partial<IntrospectState>) => void;
  grantManagementUpdate: (patch: Partial<GrantManagementState>) => void;
  resourceCallUpdate: (patch: Partial<ResourceCallState>) => void;
  refreshUpdate: (patch: Partial<RefreshState>) => void;
  revokeUpdate: (patch: Partial<RevokeState>) => void;
}

const PlaygroundContext = createContext<PlaygroundContextValue | null>(null);

function readInitialTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem("playground.theme");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function PlaygroundProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, (s) => {
    const persistedClient = loadPersistedClient();
    const persistedAuthRequest = loadPersistedAuthRequest();
    // Share-URL takes precedence: someone landing via a shared link wants
    // exactly that config, not their previously-persisted state.
    const share = readShareFromUrl();
    if (share) clearShareFromUrl();

    const issuer = share?.issuer ?? s.discovery.issuer;
    const persistedMode = loadPersistedDiscoveryMode();
    const persistedManual = loadPersistedManualEndpoints();
    const clientId =
      share?.client?.id ?? persistedClient?.clientId ?? s.client.clientId;
    const authMethod =
      share?.client?.auth ?? persistedClient?.authMethod ?? s.client.authMethod;
    const redirectUri =
      share?.client?.redirect ??
      persistedClient?.redirectUri ??
      defaultRedirectUri();

    return {
      ...s,
      theme: readInitialTheme(),
      discovery: {
        ...s.discovery,
        issuer,
        mode: persistedMode ?? s.discovery.mode,
        manual: persistedManual ?? s.discovery.manual,
      },
      client: {
        ...s.client,
        clientId,
        authMethod,
        redirectUri,
      },
      dcrRegister: { ...s.dcrRegister, redirectUris: redirectUri },
      authRequest: {
        ...s.authRequest,
        ...(persistedAuthRequest
          ? {
              scopes: persistedAuthRequest.scopes,
              customScope: persistedAuthRequest.customScope,
              responseType: persistedAuthRequest.responseType,
              responseMode: persistedAuthRequest.responseMode,
              pkceEnabled: persistedAuthRequest.pkceEnabled,
              jarEnabled: persistedAuthRequest.jarEnabled ?? false,
              prompt: persistedAuthRequest.prompt,
              loginHint: persistedAuthRequest.loginHint,
              maxAge: persistedAuthRequest.maxAge,
              authorizationDetailsEnabled:
                persistedAuthRequest.authorizationDetailsEnabled ?? false,
              authorizationDetails:
                persistedAuthRequest.authorizationDetails ?? "",
            }
          : {}),
        ...applyShareToAuthRequest(share),
      },
      par: share?.par ? { ...s.par, enabled: true } : s.par,
    };
  });

  useEffect(() => {
    if (state.theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    try {
      localStorage.setItem("playground.theme", state.theme);
    } catch {
      // ignore
    }
  }, [state.theme]);

  useEffect(() => {
    persistClient(state.client);
  }, [
    state.client.clientId,
    state.client.authMethod,
    state.client.redirectUri,
  ]);

  useEffect(() => {
    persistDiscovery(state.discovery.mode, state.discovery.manual);
  }, [state.discovery.mode, state.discovery.manual]);

  useEffect(() => {
    persistAuthRequest(state.authRequest);
  }, [
    state.authRequest.scopes,
    state.authRequest.customScope,
    state.authRequest.responseType,
    state.authRequest.responseMode,
    state.authRequest.pkceEnabled,
    state.authRequest.jarEnabled,
    state.authRequest.prompt,
    state.authRequest.loginHint,
    state.authRequest.maxAge,
    state.authRequest.authorizationDetailsEnabled,
    state.authRequest.authorizationDetails,
  ]);

  // Grant management operates on the current access token's grant. The moment
  // a new access token is minted (a fresh exchange, or a refresh), any prior
  // query/revoke result is about a now-stale grant — clear it so the step
  // reflects the new token instead of an old "revoked" banner that no longer
  // applies. Keyed on the access token only; reading gm here would loop.
  useEffect(() => {
    const gm = state.grantManagement;
    if (gm.status !== "idle" || gm.revoked || gm.grant) {
      dispatch({ type: "grant-management-reset" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.token.accessToken]);

  // Auto-exchange is a mode switch, not just a background action: turning it on
  // means "finish the flow and show me the tokens", so we trade the code and
  // move to Token exchange. Off keeps the user on the authorization result to
  // study it and exchange by hand. Ref-guards one exchange per code so
  // re-renders are no-ops and a re-run (new code) exchanges again.
  const autoExchangedCodeRef = useRef<string | null>(null);
  useEffect(() => {
    const { authorize, discovery, client, authRequest, token, autoExchange } =
      state;
    if (
      !autoExchange ||
      authorize.status !== "received" ||
      !authorize.code ||
      !discovery.metadata?.token_endpoint ||
      token.status === "loading" ||
      autoExchangedCodeRef.current === authorize.code
    ) {
      return;
    }
    const code = authorize.code;
    const metadata = discovery.metadata;
    autoExchangedCodeRef.current = code;
    void (async () => {
      dispatch({
        type: "token-update",
        patch: {
          status: "loading",
          error: undefined,
          errorDescription: undefined,
          errorBody: undefined,
          errorStatus: undefined,
        },
      });
      dispatch({ type: "set-active-step", step: "token" });
      const result = await exchangeCode({
        metadata,
        client,
        authRequest,
        code,
        onStart: (entry) => dispatch({ type: "network-add", entry }),
        onFinish: (id, patch) =>
          dispatch({ type: "network-update", id, patch }),
      });
      dispatch({
        type: "token-update",
        patch: tokenStatePatchFromResult(result, Date.now()),
      });
    })();
  }, [
    state.autoExchange,
    state.authorize.status,
    state.authorize.code,
    state.discovery.metadata,
    state.client,
    state.authRequest,
    state.token.status,
  ]);

  // Derive the RFC 8707 resource indicator from the resource context: set
  // when a PRM was loaded and the toggle is on, cleared otherwise. Downstream
  // (authorize URL, PAR, JAR, token exchange) all read authRequest.resource.
  useEffect(() => {
    const next =
      state.resource.status === "success" &&
      state.resource.indicatorEnabled &&
      state.resource.prm
        ? state.resource.prm.resource
        : "";
    if (state.authRequest.resource !== next) {
      dispatch({ type: "auth-request-update", patch: { resource: next } });
    }
  }, [
    state.resource.status,
    state.resource.indicatorEnabled,
    state.resource.prm,
    state.authRequest.resource,
  ]);

  // Seed state, nonce, and PKCE globally so the Authorize URL is complete
  // even when the user jumps straight from Discovery to Authorize.
  useEffect(() => {
    const patch: Partial<AuthRequestState> = {};
    if (!state.authRequest.state) patch.state = randomBase64Url(16);
    if (!state.authRequest.nonce) patch.nonce = randomBase64Url(16);
    if (Object.keys(patch).length) {
      dispatch({ type: "auth-request-update", patch });
    }
  }, [state.authRequest.state, state.authRequest.nonce]);

  useEffect(() => {
    if (!state.authRequest.pkceEnabled) {
      if (state.authRequest.codeVerifier || state.authRequest.codeChallenge) {
        dispatch({
          type: "auth-request-update",
          patch: { codeVerifier: "", codeChallenge: "" },
        });
      }
      return;
    }
    let cancelled = false;
    (async () => {
      if (!state.authRequest.codeVerifier) {
        const v = generateCodeVerifier();
        const c = await computeCodeChallenge(v);
        if (!cancelled) {
          dispatch({
            type: "auth-request-update",
            patch: { codeVerifier: v, codeChallenge: c },
          });
        }
        return;
      }
      if (state.authRequest.codeVerifier && !state.authRequest.codeChallenge) {
        const c = await computeCodeChallenge(state.authRequest.codeVerifier);
        if (!cancelled) {
          dispatch({
            type: "auth-request-update",
            patch: { codeChallenge: c },
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    state.authRequest.pkceEnabled,
    state.authRequest.codeVerifier,
    state.authRequest.codeChallenge,
  ]);

  // JAR (RFC 9101): keep a freshly-signed request object in state so Auth request can
  // show the real decoded JWT the instant a valid key + params exist — no
  // send-time placeholder. Mirrors the PKCE effect above (async crypto → state).
  // Keyed on the wire params + signing key so it re-signs on any relevant edit;
  // requestObjectJwt itself is NOT a dep, so writing it back can't loop.
  const jarParamsKey =
    state.authRequest.jarEnabled &&
    state.client.privateKey.status === "valid" &&
    state.discovery.metadata?.issuer
      ? buildAuthorizeParams(state.client, state.authRequest).toString()
      : "";
  useEffect(() => {
    const md = state.discovery.metadata;
    const canSign =
      state.authRequest.jarEnabled &&
      state.client.privateKey.status === "valid" &&
      !!md?.issuer;
    if (!canSign) {
      if (
        state.authRequest.requestObjectJwt !== undefined ||
        state.authRequest.requestObjectError !== undefined
      ) {
        dispatch({
          type: "auth-request-update",
          patch: {
            requestObjectJwt: undefined,
            requestObjectError: undefined,
          },
        });
      }
      return;
    }
    let cancelled = false;
    signRequestObject({
      metadata: md!,
      client: state.client,
      authRequest: state.authRequest,
    }).then((res) => {
      if (cancelled) return;
      dispatch({
        type: "auth-request-update",
        patch: res.ok
          ? { requestObjectJwt: res.jwt, requestObjectError: undefined }
          : { requestObjectJwt: undefined, requestObjectError: res.message },
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    jarParamsKey,
    state.authRequest.jarEnabled,
    state.client.privateKey.jwkText,
    state.client.privateKey.status,
    state.discovery.metadata?.issuer,
  ]);

  // Derive step statuses from data and dispatch only when something changes.
  // This replaces the old scattered setStepStatus calls inside individual
  // step useEffects — the rail now reflects truth regardless of which step
  // the user has visited.
  useEffect(() => {
    const next = computeStepStatuses({
      flow: state.flow,
      discovery: state.discovery,
      discoveryMetadata: state.discovery.metadata,
      client: state.client,
      dcrRegister: state.dcrRegister,
      federationRegister: state.federationRegister,
      authRequest: state.authRequest,
      par: state.par,
      authorize: state.authorize,
      token: state.token,
      ciba: state.ciba,
      device: state.device,
      userInfo: state.userInfo,
      introspect: state.introspect,
      grantManagement: state.grantManagement,
      resourceCall: state.resourceCall,
      refresh: state.refresh,
      revoke: state.revoke,
    });
    for (const id of Object.keys(next) as StepId[]) {
      if (state.stepStatus[id] !== next[id]) {
        dispatch({ type: "set-step-status", step: id, status: next[id] });
      }
    }
  }, [
    state.flow,
    state.discovery,
    state.client,
    state.dcrRegister,
    state.federationRegister,
    state.authRequest,
    state.par,
    state.authorize,
    state.token,
    state.ciba,
    state.device,
    state.userInfo,
    state.introspect,
    state.grantManagement,
    state.resourceCall,
    state.refresh,
    state.revoke,
    state.stepStatus,
  ]);

  // Dev-only smoke harness: expose dispatch on window so the browse-based
  // tests can seed tokens without going through a real AS. Stripped from
  // production builds by Vite's tree-shaker (import.meta.env.DEV).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!import.meta.env.DEV) return;
    (window as unknown as { __playground?: unknown }).__playground = {
      dispatch,
      state,
    };
  }, [state]);

  const setTheme = useCallback(
    (theme: "dark" | "light") => dispatch({ type: "set-theme", theme }),
    [],
  );
  const toggleTheme = useCallback(
    () =>
      dispatch({
        type: "set-theme",
        theme: state.theme === "dark" ? "light" : "dark",
      }),
    [state.theme],
  );
  const setActiveStep = useCallback(
    (step: StepId) => dispatch({ type: "set-active-step", step }),
    [],
  );
  const setStepStatus = useCallback(
    (step: StepId, status: StepStatus) =>
      dispatch({ type: "set-step-status", step, status }),
    [],
  );
  const networkAdd = useCallback(
    (entry: NetworkEntry) => dispatch({ type: "network-add", entry }),
    [],
  );
  const networkUpdate = useCallback(
    (id: string, patch: Partial<NetworkEntry>) =>
      dispatch({ type: "network-update", id, patch }),
    [],
  );
  const networkClear = useCallback(
    () => dispatch({ type: "network-clear" }),
    [],
  );
  const networkSetCollapsed = useCallback(
    (collapsed: boolean) =>
      dispatch({ type: "network-set-collapsed", collapsed }),
    [],
  );
  const setAutoExchange = useCallback(
    (value: boolean) => dispatch({ type: "set-auto-exchange", value }),
    [],
  );
  const setFlow = useCallback(
    (flow: Flow) => dispatch({ type: "set-flow", flow }),
    [],
  );
  const discoveryUpdate = useCallback(
    (patch: Partial<DiscoveryState>) =>
      dispatch({ type: "discovery-update", patch }),
    [],
  );
  const discoveryReset = useCallback(
    () => dispatch({ type: "discovery-reset" }),
    [],
  );
  const resourceUpdate = useCallback(
    (patch: Partial<ResourceContextState>) =>
      dispatch({ type: "resource-update", patch }),
    [],
  );
  const clientUpdate = useCallback(
    (patch: Partial<ClientConfigState>) =>
      dispatch({ type: "client-update", patch }),
    [],
  );
  const dcrRegisterUpdate = useCallback(
    (patch: Partial<DcrRegisterState>) =>
      dispatch({ type: "dcr-register-update", patch }),
    [],
  );
  const federationRegisterUpdate = useCallback(
    (patch: Partial<FederationRegisterState>) =>
      dispatch({ type: "federation-register-update", patch }),
    [],
  );
  const authRequestUpdate = useCallback(
    (patch: Partial<AuthRequestState>) =>
      dispatch({ type: "auth-request-update", patch }),
    [],
  );
  const parUpdate = useCallback(
    (patch: Partial<ParState>) => dispatch({ type: "par-update", patch }),
    [],
  );
  const authorizeUpdate = useCallback(
    (patch: Partial<AuthorizeState>) =>
      dispatch({ type: "authorize-update", patch }),
    [],
  );
  const tokenUpdate = useCallback(
    (patch: Partial<TokenState>) => dispatch({ type: "token-update", patch }),
    [],
  );
  const cibaUpdate = useCallback(
    (patch: Partial<CibaState>) => dispatch({ type: "ciba-update", patch }),
    [],
  );
  const cibaReset = useCallback(() => dispatch({ type: "ciba-reset" }), []);
  const deviceUpdate = useCallback(
    (patch: Partial<DeviceState>) => dispatch({ type: "device-update", patch }),
    [],
  );
  const deviceReset = useCallback(() => dispatch({ type: "device-reset" }), []);
  const inspectorUpdate = useCallback(
    (patch: Partial<InspectorState>) =>
      dispatch({ type: "inspector-update", patch }),
    [],
  );
  const userInfoUpdate = useCallback(
    (patch: Partial<UserInfoState>) =>
      dispatch({ type: "userinfo-update", patch }),
    [],
  );
  const introspectUpdate = useCallback(
    (patch: Partial<IntrospectState>) =>
      dispatch({ type: "introspect-update", patch }),
    [],
  );
  const grantManagementUpdate = useCallback(
    (patch: Partial<GrantManagementState>) =>
      dispatch({ type: "grant-management-update", patch }),
    [],
  );
  const resourceCallUpdate = useCallback(
    (patch: Partial<ResourceCallState>) =>
      dispatch({ type: "resource-call-update", patch }),
    [],
  );
  const refreshUpdate = useCallback(
    (patch: Partial<RefreshState>) =>
      dispatch({ type: "refresh-update", patch }),
    [],
  );
  const revokeUpdate = useCallback(
    (patch: Partial<RevokeState>) => dispatch({ type: "revoke-update", patch }),
    [],
  );

  const value = useMemo<PlaygroundContextValue>(
    () => ({
      state,
      setTheme,
      toggleTheme,
      setActiveStep,
      setStepStatus,
      networkAdd,
      networkUpdate,
      networkClear,
      networkSetCollapsed,
      setAutoExchange,
      setFlow,
      discoveryUpdate,
      discoveryReset,
      resourceUpdate,
      clientUpdate,
      dcrRegisterUpdate,
      federationRegisterUpdate,
      authRequestUpdate,
      parUpdate,
      authorizeUpdate,
      tokenUpdate,
      cibaUpdate,
      cibaReset,
      deviceUpdate,
      deviceReset,
      inspectorUpdate,
      userInfoUpdate,
      introspectUpdate,
      grantManagementUpdate,
      resourceCallUpdate,
      refreshUpdate,
      revokeUpdate,
    }),
    [
      state,
      setTheme,
      toggleTheme,
      setActiveStep,
      setStepStatus,
      networkAdd,
      networkUpdate,
      networkClear,
      networkSetCollapsed,
      setAutoExchange,
      setFlow,
      discoveryUpdate,
      discoveryReset,
      resourceUpdate,
      clientUpdate,
      dcrRegisterUpdate,
      federationRegisterUpdate,
      authRequestUpdate,
      parUpdate,
      authorizeUpdate,
      tokenUpdate,
      cibaUpdate,
      cibaReset,
      deviceUpdate,
      deviceReset,
      inspectorUpdate,
      userInfoUpdate,
      introspectUpdate,
      grantManagementUpdate,
      resourceCallUpdate,
      refreshUpdate,
      revokeUpdate,
    ],
  );

  return (
    <PlaygroundContext.Provider value={value}>
      {children}
    </PlaygroundContext.Provider>
  );
}

export function usePlayground() {
  const ctx = useContext(PlaygroundContext);
  if (!ctx)
    throw new Error("usePlayground must be used inside PlaygroundProvider");
  return ctx;
}
