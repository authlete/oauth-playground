import { useMemo } from "react";
import { ArrowRight, Check, Loader2, RotateCw } from "lucide-react";
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
import { revoke } from "../lib/revoke";
import type { RevokeState } from "../types";

export function RevokeStep() {
  const {
    state,
    revokeUpdate,
    tokenUpdate,
    setStepStatus,
    setActiveStep,
    networkAdd,
    networkUpdate,
  } = usePlayground();
  const rev = state.revoke;
  const endpoint = state.discovery.metadata?.revocation_endpoint;

  const tokens = useMemo(
    () => ({
      access: state.token.accessToken,
      refresh: state.token.refreshToken,
    }),
    [state.token.accessToken, state.token.refreshToken],
  );
  const selectedToken = tokens[rev.tokenSource];

  const canRevoke = !!endpoint && !!selectedToken;

  const onRevoke = async () => {
    if (!state.discovery.metadata || !selectedToken || !canRevoke) return;
    revokeUpdate({
      status: "loading",
      errorMessage: undefined,
      errorStatus: undefined,
      errorBody: undefined,
    });
    const result = await revoke({
      metadata: state.discovery.metadata,
      client: state.client,
      token: selectedToken,
      tokenHint: rev.tokenSource === "access" ? "access_token" : "refresh_token",
      onStart: networkAdd,
      onFinish: networkUpdate,
    });
    if (result.ok) {
      revokeUpdate({
        status: "success",
        lastRevokedKind: rev.tokenSource,
        revokedAt: Date.now(),
      });
      if (rev.tokenSource === "access") {
        tokenUpdate({ accessToken: undefined });
      } else {
        tokenUpdate({ refreshToken: undefined });
      }
      setStepStatus("revoke", "done");
    } else {
      revokeUpdate({
        status: "error",
        errorMessage: result.message,
        errorStatus: result.status,
        errorBody: result.body,
      });
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <StepHeader stepNumber={12} title="Revoke" right={renderPill(rev.status)} />

      {!tokens.access && !tokens.refresh && (
        <Banner tone="warn" className="mt-5">
          <p>No tokens to revoke. Step 6 hasn't run, or both were already cleared.</p>
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
          <p className="font-medium">This AS does not advertise revocation_endpoint.</p>
        </Banner>
      )}

      {endpoint && (
        <>
          <div className="mt-5">
            <label className="mb-1.5 block text-[12.5px] font-medium">
              Which token to revoke
            </label>
            <Select
              value={rev.tokenSource}
              onChange={(e) =>
                revokeUpdate({
                  tokenSource: e.target.value as RevokeState["tokenSource"],
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
            {rev.status === "loading" ? (
              <Button disabled>
                <Loader2 className="h-4 w-4 animate-spin" />
                Revoking…
              </Button>
            ) : rev.status === "success" ? (
              <Button variant="secondary" onClick={onRevoke} disabled={!canRevoke}>
                <RotateCw className="h-4 w-4" />
                Revoke another
              </Button>
            ) : (
              <Button onClick={onRevoke} disabled={!canRevoke}>
                <ArrowRight className="h-4 w-4" />
                Revoke {rev.tokenSource === "access" ? "access" : "refresh"} →
              </Button>
            )}
          </div>
        </>
      )}

      {rev.status === "success" && (
        <SuccessPanel
          revokedKind={rev.lastRevokedKind ?? rev.tokenSource}
          onTryUserinfo={() => setActiveStep("userinfo")}
        />
      )}

      {rev.status === "error" && (
        <ErrorPanel
          className="mt-4"
          message={rev.errorMessage ?? "Revoke failed."}
          status={rev.errorStatus}
          body={rev.errorBody}
        />
      )}
    </div>
  );
}

function SuccessPanel({
  revokedKind,
  onTryUserinfo,
}: {
  revokedKind: "access" | "refresh";
  onTryUserinfo: () => void;
}) {
  return (
    <Banner tone="success" className="mt-4 p-4">
      <p className="flex items-center gap-1.5 text-[13.5px] font-medium">
        <Check className="h-4 w-4 text-[var(--status-success)]" />
        {revokedKind === "access" ? "Access token" : "Refresh token"} revoked.
      </p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        The AS responds 200 regardless of whether the token was actually
        recognized — see RFC 7009 §2.2 (clients can't probe for valid tokens).
      </p>
      {revokedKind === "access" && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 text-[var(--playground-accent)]"
          onClick={onTryUserinfo}
        >
          Verify: try /userinfo (expect 401) →
        </Button>
      )}
    </Banner>
  );
}

function renderPill(status: "idle" | "loading" | "success" | "error") {
  if (status === "idle") return null;
  const map: Record<Exclude<typeof status, "idle">, { tone: StatusTone; label: string; spinning?: boolean }> = {
    loading: { tone: "muted", label: "revoking", spinning: true },
    success: { tone: "success", label: "revoked" },
    error: { tone: "error", label: "failed" },
  };
  const p = map[status];
  return (
    <StatusPill tone={p.tone} spinning={p.spinning}>
      {p.label}
    </StatusPill>
  );
}
