import { useMemo } from "react";
import { ArrowRight, Check, Loader2, RotateCw, XCircle } from "lucide-react";
import { usePlayground } from "../store/playground";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Select";
import {
  Banner,
  ErrorPanel,
  InfoCard,
  StatusPill,
  StepHeader,
  type StatusTone,
} from "../components/step";
import { formatValue } from "../lib/format";
import { introspect } from "../lib/introspect";
import type { IntrospectState } from "../types";

export function IntrospectStep() {
  const {
    state,
    introspectUpdate,
    setStepStatus,
    setActiveStep,
    networkAdd,
    networkUpdate,
  } = usePlayground();
  const intro = state.introspect;
  const endpoint = state.discovery.metadata?.introspection_endpoint;

  const tokens = useMemo(
    () => ({
      access: state.token.accessToken,
      refresh: state.token.refreshToken,
    }),
    [state.token.accessToken, state.token.refreshToken],
  );

  const selectedToken = tokens[intro.tokenSource];
  const canIntrospect = !!endpoint && !!selectedToken;

  const onRun = async () => {
    if (!state.discovery.metadata || !selectedToken || !canIntrospect) return;
    introspectUpdate({
      status: "loading",
      result: undefined,
      errorMessage: undefined,
      errorStatus: undefined,
      errorBody: undefined,
    });
    const result = await introspect({
      metadata: state.discovery.metadata,
      client: state.client,
      token: selectedToken,
      tokenHint: intro.tokenSource === "access" ? "access_token" : "refresh_token",
      onStart: networkAdd,
      onFinish: networkUpdate,
    });
    if (result.ok) {
      introspectUpdate({
        status: "success",
        result: result.result,
        fetchedAt: Date.now(),
      });
      setStepStatus("introspect", "done");
    } else {
      introspectUpdate({
        status: "error",
        errorMessage: result.message,
        errorStatus: result.status,
        errorBody: result.body,
      });
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <StepHeader stepNumber={9} title="Introspection" right={renderPill(intro.status)} />

      {!tokens.access && !tokens.refresh && (
        <Banner tone="warn" className="mt-5">
          <p>No tokens to introspect — run step 6 first.</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-[var(--playground-accent)]"
            onClick={() => setActiveStep("token")}
          >
            Go to Token exchange →
          </Button>
        </Banner>
      )}

      {(tokens.access || tokens.refresh) && !endpoint && (
        <Banner tone="error" className="mt-5">
          <p className="font-medium">This AS does not advertise introspection_endpoint.</p>
        </Banner>
      )}

      {endpoint && (
        <>
          <div className="mt-5">
            <label className="mb-1.5 block text-[12.5px] font-medium">
              Which token to introspect
            </label>
            <Select
              value={intro.tokenSource}
              onChange={(e) =>
                introspectUpdate({
                  tokenSource: e.target.value as IntrospectState["tokenSource"],
                })
              }
            >
              <option value="access" disabled={!tokens.access}>
                access_token {tokens.access ? "" : "(none)"}
              </option>
              <option value="refresh" disabled={!tokens.refresh}>
                refresh_token {tokens.refresh ? "" : "(none)"}
              </option>
            </Select>
          </div>

          <InfoCard label="Will POST to" url={endpoint} className="mt-4">
            <p className="text-muted-foreground">
              Authenticating with{" "}
              <span className="font-mono text-foreground">{state.client.authMethod}</span>.
            </p>
          </InfoCard>

          <div className="mt-5 flex flex-wrap gap-2">
            {intro.status === "loading" ? (
              <Button disabled>
                <Loader2 className="h-4 w-4 animate-spin" />
                Introspecting…
              </Button>
            ) : intro.status === "success" ? (
              <Button variant="secondary" onClick={onRun} disabled={!canIntrospect}>
                <RotateCw className="h-4 w-4" />
                Re-introspect
              </Button>
            ) : (
              <Button onClick={onRun} disabled={!canIntrospect}>
                <ArrowRight className="h-4 w-4" />
                Introspect →
              </Button>
            )}
          </div>
        </>
      )}

      {intro.status === "success" && intro.result && (
        <ResultPanel result={intro.result} />
      )}

      {intro.status === "error" && (
        <ErrorPanel
          className="mt-4"
          message={intro.errorMessage ?? "Unknown error."}
          status={intro.errorStatus}
          body={intro.errorBody}
        />
      )}
    </div>
  );
}

function ResultPanel({
  result,
}: {
  result: { active: boolean } & Record<string, unknown>;
}) {
  const active = result.active === true;
  const entries = Object.entries(result).filter(([k]) => k !== "active");
  return (
    <Banner tone={active ? "success" : "warn"} className="mt-4 p-4">
      <p className="flex items-center gap-1.5 text-[13.5px] font-medium">
        {active ? (
          <Check className="h-4 w-4 text-[var(--status-success)]" />
        ) : (
          <XCircle className="h-4 w-4 text-[var(--status-warn)]" />
        )}
        {active
          ? "Token is active."
          : "Token is NOT active (revoked, expired, or unknown)."}
      </p>
      {entries.length > 0 && (
        <table className="mt-3 w-full text-[12.5px]">
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k} className="border-b border-border/40 last:border-0">
                <td className="w-44 py-1.5 pr-3 align-top font-mono text-muted-foreground">
                  {k}
                </td>
                <td className="break-all py-1.5 font-mono">{formatValue(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Banner>
  );
}

function renderPill(status: "idle" | "loading" | "success" | "error") {
  if (status === "idle") return null;
  const map: Record<Exclude<typeof status, "idle">, { tone: StatusTone; label: string; spinning?: boolean }> = {
    loading: { tone: "muted", label: "introspecting", spinning: true },
    success: { tone: "success", label: "done" },
    error: { tone: "error", label: "failed" },
  };
  const p = map[status];
  return (
    <StatusPill tone={p.tone} spinning={p.spinning}>
      {p.label}
    </StatusPill>
  );
}
