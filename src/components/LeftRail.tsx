import { useEffect, useState } from "react";
import { Check, Copy, Link2, Lock, RotateCw } from "lucide-react";
import { usePlayground } from "../store/playground";
import {
  FLOWS,
  STEPS,
  STEP_PHASES,
  isFlowAvailable,
  type Flow,
  type StepDef,
  type StepId,
  type StepStatus,
} from "../types";
import { cn } from "../protocol/cn";
import { buildPayloadFromState, buildShareUrl } from "../protocol/shareConfig";

export function LeftRail() {
  const { state, setActiveStep, setFlow } = usePlayground();
  const [shared, setShared] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const onResetAll = () => {
    try {
      localStorage.removeItem("playground.client");
      localStorage.removeItem("playground.authRequest");
    } catch {
      // ignore
    }
    window.location.assign(window.location.origin + "/");
  };

  const onShare = async () => {
    const payload = buildPayloadFromState(state);
    const url = buildShareUrl(window.location.origin, payload);
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch {
      // Older browsers / non-secure contexts.
      window.prompt("Copy this share URL:", url);
    }
  };

  const summaries: Partial<Record<StepId, string>> = {
    discovery: discoverySummary(state),
    client: clientSummary(state),
    "dcr-register": dcrRegisterSummary(state),
    "federation-register": federationRegisterSummary(state),
    "auth-request": authRequestSummary(state),
    par: parSummary(state),
    authorize: authorizeSummary(state),
    token: tokenSummary(state),
    ciba: cibaSummary(state),
    device: deviceSummary(state),
    userinfo: userInfoSummary(state),
    introspect: introspectSummary(state),
    "grant-management": grantManagementSummary(state),
    resource: resourceSummary(state),
    refresh: refreshSummary(state),
    revoke: revokeSummary(state),
  };

  // DCR and Federation are not rail steps — they're client-identity methods
  // shown inside the Client step's "Other ways", alongside CIMD and manual.
  const visibleSteps = STEPS.filter(
    (step) =>
      state.stepStatus[step.id] !== "hidden" &&
      step.id !== "dcr-register" &&
      step.id !== "federation-register",
  );

  // The flows the AS actually supports (authorization-code is always offered
  // once discovery runs). The picker only appears when there's a choice.
  const metadata = state.discovery.metadata;
  const availableFlows = FLOWS.filter((f) => isFlowAvailable(f, metadata));

  // Number only the path TO a token (Connection + Get a token). Use/Manage/
  // Tools are menus and utilities — no sequence to imply, so no numbers.
  const stepNumber = new Map<StepId, number>();
  let n = 0;
  for (const step of visibleSteps) {
    if (
      !step.nested &&
      (step.phase === "setup" || step.phase === "get-token")
    ) {
      stepNumber.set(step.id, ++n);
    }
  }

  return (
    <nav
      aria-label="Steps"
      className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-card"
    >
      <div className="flex-1 overflow-y-auto py-2">
        {STEP_PHASES.map((phase) => {
          const steps = visibleSteps.filter((s) => s.phase === phase.id);
          if (steps.length === 0) return null;
          return (
            <section key={phase.id} className="pb-1">
              <h2 className="px-3 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {phase.label}
              </h2>
              {phase.id === "get-token" && availableFlows.length > 1 && (
                <FlowPicker
                  flows={availableFlows}
                  value={state.flow}
                  onChange={setFlow}
                />
              )}
              <ul>
                {steps.map((step) => (
                  <StepRow
                    key={step.id}
                    step={step}
                    number={stepNumber.get(step.id)}
                    status={state.stepStatus[step.id]}
                    active={state.activeStep === step.id}
                    summary={summaries[step.id]}
                    onClick={() => {
                      if (state.stepStatus[step.id] !== "locked") {
                        setActiveStep(step.id);
                      }
                    }}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <div className="flex flex-col gap-px border-t border-border p-2">
        {confirmingReset ? (
          <ResetConfirmRow
            onConfirm={onResetAll}
            onCancel={() => setConfirmingReset(false)}
          />
        ) : (
          <RailButton
            label="Reset all"
            icon={<RotateCw className="h-3.5 w-3.5" />}
            onClick={() => setConfirmingReset(true)}
          />
        )}
        <RailButton
          label={shared ? "Copied!" : "Share"}
          icon={
            shared ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )
          }
          onClick={onShare}
        />
      </div>
    </nav>
  );
}

// Two-stage confirm, in place of a native window.confirm — keeps destructive
// intent one deliberate extra click away without leaving the app's idiom.
function ResetConfirmRow({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(onCancel, 6000);
    return () => window.clearTimeout(t);
  }, [onCancel]);
  return (
    <div className="flex h-9 items-center gap-2 rounded-md px-3 text-[12.5px]">
      <span className="flex-1 text-muted-foreground">Clear every step?</span>
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-sm px-1.5 py-0.5 font-medium text-[var(--status-error)] hover:bg-accent"
      >
        Reset
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-sm px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        Cancel
      </button>
    </div>
  );
}

// The flow choice for "Get a token". Flows are alternatives, so this is a
// pick-one control; only the chosen flow's steps follow below it.
function FlowPicker({
  flows,
  value,
  onChange,
}: {
  flows: typeof FLOWS;
  value: Flow;
  onChange: (flow: Flow) => void;
}) {
  return (
    <div className="px-3 pb-1 pt-0.5">
      <select
        aria-label="Token flow"
        value={value}
        onChange={(e) => onChange(e.target.value as Flow)}
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-[12.5px] text-foreground hover:bg-accent/40"
      >
        {flows.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function StepRow({
  step,
  number,
  status,
  active,
  summary,
  onClick,
}: {
  step: StepDef;
  /** Sequence number for the path to a token; absent for menu/utility rows. */
  number?: number;
  status: StepStatus;
  active: boolean;
  summary?: string;
  onClick: () => void;
}) {
  const locked = status === "locked";
  const nested = step.nested === true;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={locked}
        aria-current={active ? "step" : undefined}
        aria-disabled={locked || undefined}
        title={summary ? `${step.name} · ${summary}` : undefined}
        className={cn(
          "relative flex w-full items-start gap-2 px-3 py-2 text-left transition-colors",
          nested ? "h-10 pl-10" : "h-14",
          !locked && "hover:bg-accent/60 cursor-pointer",
          locked && "opacity-50 cursor-not-allowed",
        )}
      >
        {active && (
          <span
            className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-sm bg-[var(--playground-accent)]"
            aria-hidden
          />
        )}
        {nested && (
          // Tree connector — a quiet L-shape that visibly starts inside the
          // parent row (negative top) and bends into the icon. Muted color +
          // 1px stroke so the auxiliary path stays subordinate to the main
          // 1→12 backbone.
          <span
            className="pointer-events-none absolute left-[22px] -top-7 h-[48px] w-4 rounded-bl-md border-b border-l border-border"
            aria-hidden
          />
        )}
        {nested ? (
          <span
            className="mt-0.5 inline-flex w-5 shrink-0 items-center justify-center text-muted-foreground"
            aria-hidden
          >
            <Link2 className="h-3 w-3" />
          </span>
        ) : number !== undefined ? (
          <span
            className={cn(
              "mt-0.5 inline-block w-5 shrink-0 text-center font-mono text-[11px]",
              active ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {number}
          </span>
        ) : (
          // Menu / utility rows carry no sequence — a quiet dot, not a number.
          <span
            className="mt-[9px] inline-flex w-5 shrink-0 justify-center"
            aria-hidden
          >
            <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn(
              "truncate font-medium leading-5",
              nested ? "text-[13px]" : "text-[14px]",
              active ? "text-foreground" : "text-foreground/90",
            )}
          >
            {step.name}
          </span>
          {summary && (
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              {summary}
            </span>
          )}
        </span>
        <StatusIcon status={status} />
      </button>
    </li>
  );
}

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === "done")
    return (
      <Check
        className="h-4 w-4 text-[var(--status-success)]"
        aria-label="done"
      />
    );
  // Config is valid but nothing was executed — a quiet dot, not a checkmark.
  if (status === "valid")
    return (
      <span
        className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--status-success)]/70"
        role="img"
        aria-label="configured"
      />
    );
  if (status === "stale")
    return (
      <RotateCw
        className="h-4 w-4 text-[var(--status-warn)]"
        aria-label="stale"
      />
    );
  if (status === "locked")
    return (
      <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="locked" />
    );
  return <span className="w-4" aria-hidden />;
}

function RailButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-2 rounded-md px-3 text-left text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function discoverySummary(
  state: ReturnType<typeof usePlayground>["state"],
): string | undefined {
  const d = state.discovery;
  if (d.status !== "success" && d.status !== "partial") return undefined;
  const host = (() => {
    try {
      return new URL(d.issuer).host;
    } catch {
      return d.issuer;
    }
  })();
  const endpointCount = d.metadata
    ? Object.values(d.metadata).filter(
        (v) => typeof v === "string" && v.startsWith("http"),
      ).length
    : 0;
  return `${host} · ${endpointCount} endpoints`;
}

function clientSummary(
  state: ReturnType<typeof usePlayground>["state"],
): string | undefined {
  if (state.stepStatus.client !== "valid") return undefined;
  const c = state.client;
  const method = c.authMethod === "none" ? "PKCE only" : c.authMethod;
  const alg =
    c.authMethod === "private_key_jwt" && c.privateKey.alg
      ? ` (${c.privateKey.alg})`
      : "";
  return `${c.clientId} · ${method}${alg}`;
}

function federationRegisterSummary(
  state: ReturnType<typeof usePlayground>["state"],
): string | undefined {
  if (state.stepStatus["federation-register"] !== "done") return undefined;
  const id = state.federationRegister.issuedClientId;
  return id ? `client_id: ${shortStr(id, 12)}` : "registered";
}

function dcrRegisterSummary(
  state: ReturnType<typeof usePlayground>["state"],
): string | undefined {
  if (state.stepStatus["dcr-register"] !== "done") return undefined;
  const id = state.dcrRegister.result?.clientId;
  return id ? `client_id: ${shortStr(id, 12)}` : "registered";
}

function authRequestSummary(
  state: ReturnType<typeof usePlayground>["state"],
): string | undefined {
  if (state.stepStatus["auth-request"] !== "valid") return undefined;
  const r = state.authRequest;
  const scopes = r.scopes.join(" ") || "no scopes";
  const pkce = r.pkceEnabled ? " · PKCE" : "";
  const par = state.par.enabled ? " · PAR" : "";
  return `${scopes}${pkce}${par}`;
}

function parSummary(
  state: ReturnType<typeof usePlayground>["state"],
): string | undefined {
  if (state.par.status !== "success" || !state.par.requestUri) return undefined;
  const uri = state.par.requestUri;
  const tail = uri.length > 12 ? `…${uri.slice(-8)}` : uri;
  return `request_uri: ${tail}`;
}

function authorizeSummary(
  state: ReturnType<typeof usePlayground>["state"],
): string | undefined {
  if (state.stepStatus.authorize !== "done") return undefined;
  const code = state.authorize.code;
  if (!code) return undefined;
  const tail =
    code.length > 12 ? `${code.slice(0, 4)}…${code.slice(-4)}` : code;
  const valid = state.authorize.stateMatches ? " · state ✓" : "";
  return `code: ${tail}${valid}`;
}

function tokenSummary(
  state: ReturnType<typeof usePlayground>["state"],
): string | undefined {
  if (state.stepStatus.token !== "done") return undefined;
  const t = state.token;
  const parts: string[] = [];
  if (t.accessToken) {
    parts.push(isJwtShape(t.accessToken) ? "access (JWT)" : "access");
  }
  if (t.refreshToken) parts.push("refresh");
  if (t.idToken) {
    const alg = jwtAlg(t.idToken);
    parts.push(alg ? `id_token (${alg})` : "id_token");
  }
  return parts.join(" · ");
}

function isJwtShape(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 3 && parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p));
}

function jwtAlg(value: string): string | undefined {
  const parts = value.split(".");
  if (parts.length !== 3) return undefined;
  try {
    const padded = parts[0] + "=".repeat((4 - (parts[0].length % 4)) % 4);
    const json = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const header = JSON.parse(json) as { alg?: unknown };
    return typeof header.alg === "string" ? header.alg : undefined;
  } catch {
    return undefined;
  }
}

function cibaSummary(
  state: ReturnType<typeof usePlayground>["state"],
): string | undefined {
  const c = state.ciba;
  if (c.status === "pending")
    return `polling · ${c.pollCount ?? 0} ${(c.pollCount ?? 0) === 1 ? "poll" : "polls"}`;
  if (c.status === "success") return "tokens issued";
  if (c.status === "expired") return "expired";
  if (c.status === "denied") return "denied";
  return undefined;
}

function deviceSummary(
  state: ReturnType<typeof usePlayground>["state"],
): string | undefined {
  const d = state.device;
  if (d.status === "pending")
    return d.userCode
      ? `code ${d.userCode} · ${d.pollCount ?? 0} ${(d.pollCount ?? 0) === 1 ? "poll" : "polls"}`
      : "polling";
  if (d.status === "success") return "tokens issued";
  if (d.status === "expired") return "expired";
  if (d.status === "denied") return "denied";
  return undefined;
}

function userInfoSummary(
  state: ReturnType<typeof usePlayground>["state"],
): string | undefined {
  if (state.stepStatus.userinfo !== "done") return undefined;
  const count = state.userInfo.claims
    ? Object.keys(state.userInfo.claims).length
    : 0;
  const sub =
    state.userInfo.claims && typeof state.userInfo.claims.sub === "string"
      ? (state.userInfo.claims.sub as string)
      : undefined;
  return sub ? `sub: ${shortStr(sub, 8)} · ${count} claims` : `${count} claims`;
}

function introspectSummary(
  state: ReturnType<typeof usePlayground>["state"],
): string | undefined {
  if (state.stepStatus.introspect !== "done") return undefined;
  const r = state.introspect.result;
  if (!r) return undefined;
  const scope = typeof r.scope === "string" ? r.scope : "";
  return `${r.active ? "active" : "inactive"}${scope ? ` · scope: ${scope}` : ""}`;
}

function grantManagementSummary(
  state: ReturnType<typeof usePlayground>["state"],
): string | undefined {
  if (state.stepStatus["grant-management"] !== "done") return undefined;
  return state.grantManagement.revoked ? "grant revoked" : "grant queried";
}

function resourceSummary(
  state: ReturnType<typeof usePlayground>["state"],
): string | undefined {
  if (state.stepStatus.resource !== "done") return undefined;
  const r = state.resourceCall.response;
  if (!r) return undefined;
  return `${r.status} · ${r.durationMs}ms`;
}

function refreshSummary(
  state: ReturnType<typeof usePlayground>["state"],
): string | undefined {
  if (state.stepStatus.refresh !== "done") return undefined;
  return "new access · rotated refresh";
}

function revokeSummary(
  state: ReturnType<typeof usePlayground>["state"],
): string | undefined {
  if (state.stepStatus.revoke !== "done") return undefined;
  const kind = state.revoke.lastRevokedKind;
  return `${kind ?? "token"} revoked`;
}

function shortStr(s: string, n: number): string {
  if (s.length <= n + 2) return s;
  return `${s.slice(0, n)}…`;
}
