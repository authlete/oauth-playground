import { useState } from "react";
import { ArrowRight, Check, Loader2, RotateCw } from "lucide-react";
import { usePlayground } from "../store/playground";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import {
  Banner,
  ErrorPanel,
  InfoCard,
  KV,
  KVGrid,
  KVList,
  KVRow,
  StatusPill,
  StepHeader,
  type StatusTone,
} from "../components/step";
import { shorten } from "../lib/format";
import { refreshTokens } from "../lib/refresh";

export function RefreshStep() {
  const {
    state,
    refreshUpdate,
    tokenUpdate,
    setStepStatus,
    setActiveStep,
    networkAdd,
    networkUpdate,
  } = usePlayground();
  const ref = state.refresh;
  const refreshToken = state.token.refreshToken;
  const endpoint = state.discovery.metadata?.token_endpoint;
  const canRefresh = !!endpoint && !!refreshToken;
  const [diff, setDiff] = useState<TokenDiff | null>(null);

  const onRefresh = async () => {
    if (!state.discovery.metadata || !refreshToken || !canRefresh) return;
    const previousRefresh = state.token.refreshToken;
    const previousId = state.token.idToken;

    refreshUpdate({
      status: "loading",
      errorMessage: undefined,
      errorStatus: undefined,
      errorBody: undefined,
    });
    const result = await refreshTokens({
      metadata: state.discovery.metadata,
      client: state.client,
      refreshToken,
      downscope: ref.downscope,
      onStart: networkAdd,
      onFinish: networkUpdate,
    });
    if (result.ok) {
      const expiresAt =
        typeof result.expiresIn === "number"
          ? Date.now() + result.expiresIn * 1000
          : undefined;
      tokenUpdate({
        accessToken: result.accessToken,
        tokenType: result.tokenType,
        expiresIn: result.expiresIn,
        expiresAt,
        refreshToken: result.refreshToken ?? state.token.refreshToken,
        idToken: result.idToken ?? state.token.idToken,
        scope: result.scope ?? state.token.scope,
        exchangedAt: Date.now(),
      });
      refreshUpdate({ status: "success", refreshedAt: Date.now() });
      setStepStatus("refresh", "done");
      setDiff({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken ?? state.token.refreshToken,
        idToken: result.idToken ?? state.token.idToken,
        expiresIn: result.expiresIn,
        rotated: !!result.refreshToken && result.refreshToken !== previousRefresh,
        idTokenChanged: !!result.idToken && result.idToken !== previousId,
      });
    } else {
      refreshUpdate({
        status: "error",
        errorMessage: result.error
          ? `${result.error}${result.errorDescription ? ` — ${result.errorDescription}` : ""}`
          : result.message,
        errorStatus: result.status,
        errorBody: result.body,
      });
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <StepHeader stepNumber={11} title="Refresh" right={renderPill(ref.status)} />

      {!refreshToken && (
        <Banner tone="warn" className="mt-5">
          <p>No refresh token — step 6 either didn't return one or hasn't run.</p>
          <p className="mt-1 text-muted-foreground">
            Add <code className="font-mono">offline_access</code> to scopes in step 3
            and re-run the flow.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-[var(--playground-accent)]"
            onClick={() => setActiveStep("auth-request")}
          >
            Go to Auth request →
          </Button>
        </Banner>
      )}

      {refreshToken && endpoint && (
        <>
          <InfoCard label="Will POST to" url={endpoint} className="mt-5">
            <KVGrid className="mt-2">
              <KVRow label="grant_type">refresh_token</KVRow>
              <KVRow label="refresh_token">{shorten(refreshToken, 10, 6)}</KVRow>
              <KVRow label="client auth">{state.client.authMethod}</KVRow>
            </KVGrid>
          </InfoCard>

          <div className="mt-4">
            <label className="mb-1.5 block text-[12.5px] font-medium">
              Downscope (optional)
            </label>
            <Input
              mono
              value={ref.downscope}
              onChange={(e) => refreshUpdate({ downscope: e.target.value })}
              placeholder="e.g. openid (subset of original)"
            />
            <p className="mt-1 text-[12px] text-muted-foreground">
              The AS may issue a narrower access token. Leave blank to keep the
              original scopes.
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {ref.status === "loading" ? (
              <Button disabled>
                <Loader2 className="h-4 w-4 animate-spin" />
                Refreshing…
              </Button>
            ) : ref.status === "success" ? (
              <Button variant="secondary" onClick={onRefresh}>
                <RotateCw className="h-4 w-4" />
                Refresh again
              </Button>
            ) : (
              <Button onClick={onRefresh}>
                <ArrowRight className="h-4 w-4" />
                Refresh tokens →
              </Button>
            )}
          </div>
        </>
      )}

      {ref.status === "success" && diff && <SuccessPanel diff={diff} />}

      {ref.status === "error" && (
        <ErrorPanel
          className="mt-4"
          message={ref.errorMessage ?? "Refresh failed."}
          status={ref.errorStatus}
          body={ref.errorBody}
        />
      )}
    </div>
  );
}

interface TokenDiff {
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
  rotated?: boolean;
  idTokenChanged?: boolean;
}

function SuccessPanel({ diff }: { diff: TokenDiff }) {
  return (
    <Banner tone="success" className="mt-4 p-4">
      <p className="flex items-center gap-1.5 text-[13.5px] font-medium">
        <Check className="h-4 w-4 text-[var(--status-success)]" />
        New tokens received — step 6's slice has been updated.
      </p>
      <KVList className="mt-3">
        {diff.accessToken && (
          <KV label="access_token">
            <span className="font-mono">{shorten(diff.accessToken, 10, 6)}</span>
            <span className="ml-2 text-muted-foreground">(new)</span>
          </KV>
        )}
        {diff.idToken && (
          <KV label="id_token">
            <span className="font-mono">{shorten(diff.idToken, 10, 6)}</span>
            {diff.idTokenChanged && (
              <span className="ml-2 text-muted-foreground">(new)</span>
            )}
          </KV>
        )}
        {diff.refreshToken && (
          <KV label="refresh_token">
            <span className="font-mono">{shorten(diff.refreshToken, 10, 6)}</span>
            {diff.rotated ? (
              <span className="ml-2 text-[var(--status-success)]">
                rotated — keep the new one
              </span>
            ) : (
              <span className="ml-2 text-muted-foreground">(unchanged)</span>
            )}
          </KV>
        )}
        {typeof diff.expiresIn === "number" && (
          <KV label="expires_in">
            <span className="font-mono">{diff.expiresIn}s</span>
          </KV>
        )}
      </KVList>
    </Banner>
  );
}

function renderPill(status: "idle" | "loading" | "success" | "error") {
  if (status === "idle") return null;
  const map: Record<Exclude<typeof status, "idle">, { tone: StatusTone; label: string; spinning?: boolean }> = {
    loading: { tone: "muted", label: "refreshing", spinning: true },
    success: { tone: "success", label: "rotated" },
    error: { tone: "error", label: "failed" },
  };
  const p = map[status];
  return (
    <StatusPill tone={p.tone} spinning={p.spinning}>
      {p.label}
    </StatusPill>
  );
}
