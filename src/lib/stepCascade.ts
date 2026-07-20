// Centralised step status: derives every step's status from the current
// state in one place. The old behaviour was "each step sets its own status
// from inside a useEffect" — that meant a step's status didn't update until
// the user navigated to it, which made the rail lie about progress.

import { buildAuthorizeUrl } from "./authorizeUrl";
import { validateClientConfig } from "./clientConfig";
import { jarReadiness } from "./requestObject";
import type { StepId, StepStatus } from "../types";

interface CascadeState {
  discovery: { status: string };
  client: Parameters<typeof validateClientConfig>[0];
  dcrRegister: { status: string };
  federationRegister: { status: string };
  authRequest: Parameters<typeof buildAuthorizeUrl>[2];
  par: { enabled: boolean; status: string; requestUri?: string };
  authorize: { status: string; stateMatches?: boolean };
  token: { status: string; accessToken?: string };
  userInfo: { status: string };
  introspect: { status: string };
  resourceCall: { status: string };
  refresh: { status: string };
  revoke: { status: string };
  discoveryMetadata: Parameters<typeof buildAuthorizeUrl>[0];
}

export function computeStepStatuses(state: CascadeState): Record<StepId, StepStatus> {
  const discoveryDone =
    state.discovery.status === "success" || state.discovery.status === "partial";
  const clientValid = validateClientConfig(state.client).ok;
  const authUrlBuilt =
    buildAuthorizeUrl(state.discoveryMetadata, state.client, state.authRequest).ok &&
    state.authRequest.scopes.length > 0 &&
    jarReadiness(state.client, state.authRequest).ok;
  const parReady = state.par.enabled
    ? state.par.status === "success" && !!state.par.requestUri
    : true;
  const authorizeReceived =
    state.authorize.status === "received" && state.authorize.stateMatches === true;
  const tokenSucceeded =
    state.token.status === "success" && !!state.token.accessToken;

  // DCR and Federation registration each appear only when the AS advertises the
  // matching endpoint. Both are enhancements to step 2's output (they produce a
  // client_id), never gates on later steps — no other step depends on them.
  const dcrEndpoint =
    typeof state.discoveryMetadata?.registration_endpoint === "string";
  const federationEndpoint =
    typeof state.discoveryMetadata?.federation_registration_endpoint === "string";

  const status: Record<StepId, StepStatus> = {
    discovery: discoveryDone ? "done" : "active",
    client: !discoveryDone ? "locked" : clientValid ? "done" : "ready",
    "dcr-register": !dcrEndpoint
      ? "hidden"
      : state.dcrRegister.status === "success"
        ? "done"
        : "ready",
    "federation-register": !federationEndpoint
      ? "hidden"
      : state.federationRegister.status === "success"
        ? "done"
        : "ready",
    "auth-request": !clientValid
      ? "locked"
      : authUrlBuilt
        ? "done"
        : "ready",
    par: !authUrlBuilt
      ? "locked"
      : !state.par.enabled
        ? "ready"
        : state.par.status === "success"
          ? "done"
          : "ready",
    authorize: !authUrlBuilt
      ? "locked"
      : !parReady
        ? "locked"
        : authorizeReceived
          ? "done"
          : "ready",
    token: !authorizeReceived ? "locked" : tokenSucceeded ? "done" : "ready",
    // Inspector is passive — unlock as soon as JWKS is available (i.e.
    // Discovery succeeded). It never reaches "done"; it stays ready.
    inspect: !discoveryDone ? "locked" : "ready",
    userinfo: !tokenSucceeded
      ? "locked"
      : state.userInfo.status === "success"
        ? "done"
        : "ready",
    introspect: !tokenSucceeded
      ? "locked"
      : state.introspect.status === "success"
        ? "done"
        : "ready",
    resource: !tokenSucceeded
      ? "locked"
      : state.resourceCall.status === "success"
        ? "done"
        : "ready",
    refresh: !tokenSucceeded
      ? "locked"
      : state.refresh.status === "success"
        ? "done"
        : "ready",
    revoke: !tokenSucceeded
      ? "locked"
      : state.revoke.status === "success"
        ? "done"
        : "ready",
  };

  return status;
}
