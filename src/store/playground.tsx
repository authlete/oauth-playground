import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { computeStepStatuses } from "../lib/stepCascade";
import { computeCodeChallenge, generateCodeVerifier } from "../lib/pkce";
import { randomBase64Url } from "../lib/random";
import {
  clearShareFromUrl,
  readShareFromUrl,
  type SharePayload,
} from "../lib/shareConfig";
import {
  DEFAULT_AUTHORIZE,
  DEFAULT_AUTH_REQUEST,
  DEFAULT_CLIENT_CONFIG,
  DEFAULT_INSPECTOR,
  DEFAULT_INTROSPECT,
  DEFAULT_PAR,
  DEFAULT_REFRESH,
  DEFAULT_RESOURCE_CALL,
  DEFAULT_REVOKE,
  DEFAULT_TOKEN,
  DEFAULT_USERINFO,
  EMPTY_MANUAL_ENDPOINTS,
  type AuthRequestState,
  type AuthorizeState,
  type ClientConfigState,
  type DiscoveryState,
  type InspectorState,
  type IntrospectState,
  type ManualEndpoints,
  type NetworkEntry,
  type ParState,
  type RefreshState,
  type ResourceCallState,
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
  discovery: DiscoveryState;
  client: ClientConfigState;
  authRequest: AuthRequestState;
  par: ParState;
  authorize: AuthorizeState;
  token: TokenState;
  inspector: InspectorState;
  userInfo: UserInfoState;
  introspect: IntrospectState;
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
  | { type: "discovery-update"; patch: Partial<DiscoveryState> }
  | { type: "discovery-reset" }
  | { type: "client-update"; patch: Partial<ClientConfigState> }
  | { type: "auth-request-update"; patch: Partial<AuthRequestState> }
  | { type: "par-update"; patch: Partial<ParState> }
  | { type: "authorize-update"; patch: Partial<AuthorizeState> }
  | { type: "token-update"; patch: Partial<TokenState> }
  | { type: "inspector-update"; patch: Partial<InspectorState> }
  | { type: "userinfo-update"; patch: Partial<UserInfoState> }
  | { type: "introspect-update"; patch: Partial<IntrospectState> }
  | { type: "resource-call-update"; patch: Partial<ResourceCallState> }
  | { type: "refresh-update"; patch: Partial<RefreshState> }
  | { type: "revoke-update"; patch: Partial<RevokeState> };

const DEFAULT_ISSUER = "http://localhost:3000";
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
  prompt: string;
  loginHint: string;
  maxAge: string;
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

function loadPersistedDiscoveryMode(): "wellknown" | "manual" | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(DISCOVERY_MODE_PERSIST_KEY);
  return raw === "manual" || raw === "wellknown" ? raw : null;
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

function persistDiscovery(mode: "wellknown" | "manual", manual: ManualEndpoints) {
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
      prompt: state.prompt,
      loginHint: state.loginHint,
      maxAge: state.maxAge,
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
    "auth-request": "locked",
    par: "locked",
    authorize: "locked",
    token: "locked",
    inspect: "locked",
    userinfo: "locked",
    introspect: "locked",
    resource: "locked",
    refresh: "locked",
    revoke: "locked",
  },
  network: [],
  discovery: {
    status: "idle",
    issuer: DEFAULT_ISSUER,
    mode: "wellknown",
    manual: { ...EMPTY_MANUAL_ENDPOINTS },
  },
  client: DEFAULT_CLIENT_CONFIG,
  authRequest: DEFAULT_AUTH_REQUEST,
  par: DEFAULT_PAR,
  authorize: DEFAULT_AUTHORIZE,
  token: DEFAULT_TOKEN,
  inspector: DEFAULT_INSPECTOR,
  userInfo: DEFAULT_USERINFO,
  introspect: DEFAULT_INTROSPECT,
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
      return { ...state, network: [...state.network, action.entry] };
    case "network-update":
      return {
        ...state,
        network: state.network.map((e) =>
          e.id === action.id ? { ...e, ...action.patch } : e,
        ),
      };
    case "network-clear":
      return { ...state, network: [] };
    case "discovery-update":
      return { ...state, discovery: { ...state.discovery, ...action.patch } };
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
    case "inspector-update":
      return { ...state, inspector: { ...state.inspector, ...action.patch } };
    case "userinfo-update":
      return { ...state, userInfo: { ...state.userInfo, ...action.patch } };
    case "introspect-update":
      return { ...state, introspect: { ...state.introspect, ...action.patch } };
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
  discoveryUpdate: (patch: Partial<DiscoveryState>) => void;
  discoveryReset: () => void;
  clientUpdate: (patch: Partial<ClientConfigState>) => void;
  authRequestUpdate: (patch: Partial<AuthRequestState>) => void;
  parUpdate: (patch: Partial<ParState>) => void;
  authorizeUpdate: (patch: Partial<AuthorizeState>) => void;
  tokenUpdate: (patch: Partial<TokenState>) => void;
  inspectorUpdate: (patch: Partial<InspectorState>) => void;
  userInfoUpdate: (patch: Partial<UserInfoState>) => void;
  introspectUpdate: (patch: Partial<IntrospectState>) => void;
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
      share?.client?.auth ??
      persistedClient?.authMethod ??
      s.client.authMethod;
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
      authRequest: {
        ...s.authRequest,
        ...(persistedAuthRequest
          ? {
              scopes: persistedAuthRequest.scopes,
              customScope: persistedAuthRequest.customScope,
              responseType: persistedAuthRequest.responseType,
              responseMode: persistedAuthRequest.responseMode,
              pkceEnabled: persistedAuthRequest.pkceEnabled,
              prompt: persistedAuthRequest.prompt,
              loginHint: persistedAuthRequest.loginHint,
              maxAge: persistedAuthRequest.maxAge,
            }
          : {}),
        ...applyShareToAuthRequest(share),
      },
      par: share?.par
        ? { ...s.par, enabled: true }
        : s.par,
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
  }, [state.client.clientId, state.client.authMethod, state.client.redirectUri]);

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
    state.authRequest.prompt,
    state.authRequest.loginHint,
    state.authRequest.maxAge,
  ]);

  // Seed state, nonce, and PKCE globally so the Authorize URL is complete
  // even when the user jumps straight from Discovery to step 5.
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

  // Derive step statuses from data and dispatch only when something changes.
  // This replaces the old scattered setStepStatus calls inside individual
  // step useEffects — the rail now reflects truth regardless of which step
  // the user has visited.
  useEffect(() => {
    const next = computeStepStatuses({
      discovery: state.discovery,
      discoveryMetadata: state.discovery.metadata,
      client: state.client,
      authRequest: state.authRequest,
      par: state.par,
      authorize: state.authorize,
      token: state.token,
      userInfo: state.userInfo,
      introspect: state.introspect,
      resourceCall: state.resourceCall,
      refresh: state.refresh,
      revoke: state.revoke,
    });
    for (const id of Object.keys(next) as Array<keyof typeof next>) {
      if (state.stepStatus[id] !== next[id]) {
        dispatch({ type: "set-step-status", step: id, status: next[id] });
      }
    }
  }, [
    state.discovery,
    state.client,
    state.authRequest,
    state.par,
    state.authorize,
    state.token,
    state.userInfo,
    state.introspect,
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
  const networkClear = useCallback(() => dispatch({ type: "network-clear" }), []);
  const discoveryUpdate = useCallback(
    (patch: Partial<DiscoveryState>) =>
      dispatch({ type: "discovery-update", patch }),
    [],
  );
  const discoveryReset = useCallback(() => dispatch({ type: "discovery-reset" }), []);
  const clientUpdate = useCallback(
    (patch: Partial<ClientConfigState>) =>
      dispatch({ type: "client-update", patch }),
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
      discoveryUpdate,
      discoveryReset,
      clientUpdate,
      authRequestUpdate,
      parUpdate,
      authorizeUpdate,
      tokenUpdate,
      inspectorUpdate,
      userInfoUpdate,
      introspectUpdate,
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
      discoveryUpdate,
      discoveryReset,
      clientUpdate,
      authRequestUpdate,
      parUpdate,
      authorizeUpdate,
      tokenUpdate,
      inspectorUpdate,
      userInfoUpdate,
      introspectUpdate,
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
  if (!ctx) throw new Error("usePlayground must be used inside PlaygroundProvider");
  return ctx;
}
