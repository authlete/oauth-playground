import { useState } from "react";
import { Check, Copy, Lock, RotateCw } from "lucide-react";
import { usePlayground } from "../store/playground";
import { STEPS, type StepDef, type StepId, type StepStatus } from "../types";
import { cn } from "../lib/cn";
import { buildPayloadFromState, buildShareUrl } from "../lib/shareConfig";

export function LeftRail() {
  const { state, setActiveStep } = usePlayground();
  const [shared, setShared] = useState(false);

  const onResetAll = () => {
    const confirmed = window.confirm(
      "Reset all? This clears every step's state and your saved client config. Theme is kept.",
    );
    if (!confirmed) return;
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
    "auth-request": authRequestSummary(state),
    par: parSummary(state),
    authorize: authorizeSummary(state),
    token: tokenSummary(state),
    userinfo: userInfoSummary(state),
    introspect: introspectSummary(state),
    resource: resourceSummary(state),
    refresh: refreshSummary(state),
    revoke: revokeSummary(state),
  };

  return (
    <nav
      aria-label="Steps"
      className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-card"
    >
      <ul className="flex-1 overflow-y-auto py-2">
        {STEPS.map((step) => (
          <StepRow
            key={step.id}
            step={step}
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
      <div className="flex flex-col gap-px border-t border-border p-2">
        <RailButton label="Reset all" icon={<RotateCw className="h-3.5 w-3.5" />} onClick={onResetAll} />
        <RailButton
          label={shared ? "Copied!" : "Share"}
          icon={shared ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          onClick={onShare}
        />
      </div>
    </nav>
  );
}

function StepRow({
  step,
  status,
  active,
  summary,
  onClick,
}: {
  step: StepDef;
  status: StepStatus;
  active: boolean;
  summary?: string;
  onClick: () => void;
}) {
  const locked = status === "locked";
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={locked}
        aria-current={active ? "step" : undefined}
        aria-disabled={locked || undefined}
        className={cn(
          "relative flex w-full items-start gap-2 px-3 py-2 text-left transition-colors",
          "h-14",
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
        <span
          className={cn(
            "mt-0.5 inline-block w-5 shrink-0 text-center font-mono text-[11px]",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {step.number}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn(
              "truncate text-[14px] font-medium leading-5",
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
    return <Check className="h-4 w-4 text-[var(--status-success)]" aria-label="done" />;
  if (status === "stale")
    return <RotateCw className="h-4 w-4 text-[var(--status-warn)]" aria-label="stale" />;
  if (status === "locked")
    return <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="locked" />;
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

function discoverySummary(state: ReturnType<typeof usePlayground>["state"]): string | undefined {
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

function clientSummary(state: ReturnType<typeof usePlayground>["state"]): string | undefined {
  if (state.stepStatus.client !== "done") return undefined;
  const c = state.client;
  const method = c.authMethod === "none" ? "PKCE only" : c.authMethod;
  const alg =
    c.authMethod === "private_key_jwt" && c.privateKey.alg
      ? ` (${c.privateKey.alg})`
      : "";
  return `${c.clientId} · ${method}${alg}`;
}

function authRequestSummary(state: ReturnType<typeof usePlayground>["state"]): string | undefined {
  if (state.stepStatus["auth-request"] !== "done") return undefined;
  const r = state.authRequest;
  const scopes = r.scopes.join(" ") || "no scopes";
  const pkce = r.pkceEnabled ? " · PKCE" : "";
  const par = state.par.enabled ? " · PAR" : "";
  return `${scopes}${pkce}${par}`;
}

function parSummary(state: ReturnType<typeof usePlayground>["state"]): string | undefined {
  if (!state.par.enabled) return "off";
  if (state.par.status !== "success" || !state.par.requestUri) return undefined;
  const uri = state.par.requestUri;
  const tail = uri.length > 12 ? `…${uri.slice(-8)}` : uri;
  return `request_uri: ${tail}`;
}

function authorizeSummary(state: ReturnType<typeof usePlayground>["state"]): string | undefined {
  if (state.stepStatus.authorize !== "done") return undefined;
  const code = state.authorize.code;
  if (!code) return undefined;
  const tail =
    code.length > 12 ? `${code.slice(0, 4)}…${code.slice(-4)}` : code;
  const valid = state.authorize.stateMatches ? " · state ✓" : "";
  return `code: ${tail}${valid}`;
}

function tokenSummary(state: ReturnType<typeof usePlayground>["state"]): string | undefined {
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

function userInfoSummary(state: ReturnType<typeof usePlayground>["state"]): string | undefined {
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

function introspectSummary(state: ReturnType<typeof usePlayground>["state"]): string | undefined {
  if (state.stepStatus.introspect !== "done") return undefined;
  const r = state.introspect.result;
  if (!r) return undefined;
  const scope = typeof r.scope === "string" ? r.scope : "";
  return `${r.active ? "active" : "inactive"}${scope ? ` · scope: ${scope}` : ""}`;
}

function resourceSummary(state: ReturnType<typeof usePlayground>["state"]): string | undefined {
  if (state.stepStatus.resource !== "done") return undefined;
  const r = state.resourceCall.response;
  if (!r) return undefined;
  return `${r.status} · ${r.durationMs}ms`;
}

function refreshSummary(state: ReturnType<typeof usePlayground>["state"]): string | undefined {
  if (state.stepStatus.refresh !== "done") return undefined;
  return "new access · rotated refresh";
}

function revokeSummary(state: ReturnType<typeof usePlayground>["state"]): string | undefined {
  if (state.stepStatus.revoke !== "done") return undefined;
  const kind = state.revoke.lastRevokedKind;
  return `${kind ?? "token"} revoked`;
}

function shortStr(s: string, n: number): string {
  if (s.length <= n + 2) return s;
  return `${s.slice(0, n)}…`;
}
