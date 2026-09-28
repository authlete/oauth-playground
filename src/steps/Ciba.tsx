import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  KeyRound,
  Loader2,
  RadioTower,
  RotateCw,
  Send,
  Square,
} from "lucide-react";
import { usePlayground } from "../store/playground";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import {
  AuthorizationDetailChips,
  Banner,
  ErrorPanel,
  RequestPreview,
  Section,
  StatusPill,
  StepHeader,
  type StatusTone,
} from "../components/step";
import { formatDuration } from "../lib/format";
import { looksLikeJwt } from "../lib/jwt";
import { validateClientConfig } from "../lib/clientConfig";
import { parseAuthorizationDetails } from "../lib/authorizationDetails";
import { previewCiba } from "../lib/requestPreview";
import { startBackchannelAuth } from "../lib/cibaAuth";
import { pollCibaToken } from "../lib/cibaPoll";

export function CibaStep() {
  const {
    state,
    cibaUpdate,
    cibaReset,
    tokenUpdate,
    authRequestUpdate,
    inspectorUpdate,
    setActiveStep,
    networkAdd,
    networkUpdate,
  } = usePlayground();
  const ciba = state.ciba;
  const metadata = state.discovery.metadata;
  const endpoint = metadata?.backchannel_authentication_endpoint;
  const client = state.client;
  const authRequest = state.authRequest;

  const [remaining, setRemaining] = useState<number | null>(null);

  // Countdown to auth_req_id expiry while polling.
  useEffect(() => {
    if (ciba.status !== "pending" || !ciba.startedAt || !ciba.expiresIn) {
      setRemaining(null);
      return;
    }
    const update = () => {
      const left =
        ciba.expiresIn! - Math.floor((Date.now() - ciba.startedAt!) / 1000);
      setRemaining(Math.max(0, left));
    };
    update();
    const t = window.setInterval(update, 1000);
    return () => window.clearInterval(t);
  }, [ciba.status, ciba.startedAt, ciba.expiresIn]);

  // Poll loop — keyed on status + auth_req_id so per-poll updates don't restart
  // it; the cancellation flag stops it on stop / unmount / strict-mode remount.
  useEffect(() => {
    if (ciba.status !== "pending" || !ciba.authReqId || !metadata) return;
    const ctl = { cancelled: false };
    let interval = ciba.interval ?? 5;
    let count = ciba.pollCount ?? 0;
    const deadline =
      ciba.startedAt && ciba.expiresIn
        ? ciba.startedAt + ciba.expiresIn * 1000
        : undefined;
    let timer = 0;

    const tick = async () => {
      if (ctl.cancelled) return;
      if (deadline && Date.now() >= deadline) {
        cibaUpdate({
          status: "expired",
          errorMessage: "The auth_req_id expired before the user approved.",
        });
        return;
      }
      count += 1;
      cibaUpdate({ pollCount: count });
      const outcome = await pollCibaToken({
        metadata,
        client,
        authReqId: ciba.authReqId!,
        onStart: networkAdd,
        onFinish: networkUpdate,
      });
      if (ctl.cancelled) return;
      switch (outcome.kind) {
        case "success": {
          const t = outcome.token;
          const expiresAt =
            typeof t.expiresIn === "number"
              ? Date.now() + t.expiresIn * 1000
              : undefined;
          tokenUpdate({
            status: "success",
            accessToken: t.accessToken,
            tokenType: t.tokenType,
            expiresIn: t.expiresIn,
            expiresAt,
            refreshToken: t.refreshToken,
            idToken: t.idToken,
            scope: t.scope,
            authorizationDetails: t.authorizationDetails,
            grantId: t.grantId,
            exchangedAt: Date.now(),
            error: undefined,
            errorDescription: undefined,
            errorBody: undefined,
            errorStatus: undefined,
          });
          cibaUpdate({ status: "success", lastResult: undefined });
          return;
        }
        case "pending":
          cibaUpdate({ lastResult: "authorization_pending" });
          break;
        case "slow_down":
          interval += 5;
          cibaUpdate({ lastResult: "slow_down", interval });
          break;
        case "expired":
          cibaUpdate({ status: "expired", errorMessage: outcome.message });
          return;
        case "denied":
          cibaUpdate({ status: "denied", errorMessage: outcome.message });
          return;
        case "error":
          cibaUpdate({
            status: "error",
            errorMessage: outcome.message,
            errorStatus: outcome.status,
            errorBody: outcome.body,
          });
          return;
      }
      if (!ctl.cancelled) timer = window.setTimeout(tick, interval * 1000);
    };
    // First poll after one interval, as a real CD paces itself.
    timer = window.setTimeout(tick, interval * 1000);
    return () => {
      ctl.cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ciba.status, ciba.authReqId]);

  const clientValid = validateClientConfig(client).ok;
  const isPublic = client.authMethod === "none";
  const hasLoginHint = authRequest.loginHint.trim().length > 0;
  const hasScopes = authRequest.scopes.length > 0;
  const canStart =
    !!endpoint &&
    clientValid &&
    !isPublic &&
    hasScopes &&
    hasLoginHint &&
    ciba.status !== "starting" &&
    ciba.status !== "pending";

  const onStart = async () => {
    if (!metadata || !endpoint || !canStart) return;
    cibaUpdate({
      status: "starting",
      authReqId: undefined,
      expiresIn: undefined,
      interval: undefined,
      startedAt: undefined,
      pollCount: 0,
      lastResult: undefined,
      errorMessage: undefined,
      errorStatus: undefined,
      errorBody: undefined,
    });
    const result = await startBackchannelAuth({
      metadata,
      client,
      authRequest,
      ciba,
      onStart: networkAdd,
      onFinish: networkUpdate,
    });
    if (result.ok) {
      cibaUpdate({
        status: "pending",
        authReqId: result.authReqId,
        expiresIn: result.expiresIn,
        interval: result.interval,
        startedAt: Date.now(),
        pollCount: 0,
      });
    } else {
      cibaUpdate({
        status: "error",
        errorMessage: result.message,
        errorStatus: result.status,
        errorBody: result.body,
      });
    }
  };

  const onStop = () => cibaReset();

  const openInInspector = (source: "access" | "id" | "refresh") => {
    inspectorUpdate({ source });
    setActiveStep("inspect");
  };

  return (
    <div className="mx-auto max-w-3xl @4xl:max-w-5xl">
      <StepHeader step="ciba" right={renderPill(ciba.status, remaining)} />

      <p className="mt-4 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
        The playground (consumption device) requests authentication out-of-band;
        the user approves on their own device, and the playground polls the
        token endpoint for the result. Poll mode only.
      </p>

      {!endpoint && (
        <Banner tone="error" className="mt-4">
          No{" "}
          <code className="font-mono">backchannel_authentication_endpoint</code>{" "}
          in discovery — this AS doesn't support CIBA.
        </Banner>
      )}

      {endpoint && isPublic && (
        <Banner tone="warn" className="mt-4">
          <p>
            CIBA needs a confidential client —{" "}
            <span className="font-mono">token_endpoint_auth_method: none</span>{" "}
            can't initiate it.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-[var(--playground-accent)]"
            onClick={() => setActiveStep("client")}
          >
            Go to Client config →
          </Button>
        </Banner>
      )}

      {endpoint && (
        <>
          <Section
            title="Backchannel request"
            description="Who to prompt, and what to grant."
            className="mt-4"
          >
            <div className="space-y-3">
              <Field label="login_hint" required>
                <Input
                  value={authRequest.loginHint}
                  onChange={(e) =>
                    authRequestUpdate({ loginHint: e.target.value })
                  }
                  placeholder="e.g. user@example.com or a subject identifier"
                  disabled={ciba.status === "pending"}
                />
              </Field>
              <div className="grid gap-3 @2xl:grid-cols-2">
                <Field label="binding_message">
                  <Input
                    value={ciba.bindingMessage}
                    onChange={(e) =>
                      cibaUpdate({ bindingMessage: e.target.value })
                    }
                    placeholder="optional — e.g. W4SCT"
                    disabled={ciba.status === "pending"}
                  />
                </Field>
                <Field label="requested_expiry">
                  <Input
                    value={ciba.requestedExpiry}
                    onChange={(e) =>
                      cibaUpdate({ requestedExpiry: e.target.value })
                    }
                    placeholder="optional — seconds"
                    inputMode="numeric"
                    disabled={ciba.status === "pending"}
                  />
                </Field>
              </div>
              <GrantSummary
                scopes={authRequest.scopes}
                rarEnabled={authRequest.authorizationDetailsEnabled}
                rarText={authRequest.authorizationDetails}
                onEdit={() => setActiveStep("auth-request")}
              />
            </div>
          </Section>

          <RequestPreview
            className="mt-4"
            block={previewCiba(endpoint, client, authRequest, ciba)}
          />

          {!hasLoginHint && (
            <Banner tone="warn" className="mt-4">
              login_hint is required.
            </Banner>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {ciba.status === "starting" ? (
              <Button disabled>
                <Loader2 className="h-4 w-4 animate-spin" />
                Requesting…
              </Button>
            ) : ciba.status === "pending" ? (
              <Button variant="secondary" onClick={onStop}>
                <Square className="h-4 w-4" />
                Stop polling
              </Button>
            ) : ciba.status === "success" ? (
              <Button
                variant="secondary"
                onClick={onStart}
                disabled={!canStart}
              >
                <RotateCw className="h-4 w-4" />
                Start again
              </Button>
            ) : (
              <Button onClick={onStart} disabled={!canStart}>
                <Send className="h-4 w-4" />
                Start backchannel auth
              </Button>
            )}
            {ciba.status === "success" && (
              <>
                {state.token.idToken && (
                  <Button
                    variant="ghost"
                    onClick={() => openInInspector("id")}
                    className="text-[var(--playground-accent)]"
                  >
                    <KeyRound className="h-4 w-4" />
                    Inspect id_token
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => setActiveStep("userinfo")}
                  className="text-[var(--playground-accent)]"
                >
                  <ArrowRight className="h-4 w-4" />
                  Continue to UserInfo
                </Button>
              </>
            )}
          </div>

          {ciba.status === "pending" && (
            <PendingPanel
              authReqId={ciba.authReqId}
              interval={ciba.interval ?? 5}
              pollCount={ciba.pollCount ?? 0}
              lastResult={ciba.lastResult}
              remaining={remaining}
            />
          )}

          {ciba.status === "success" && (
            <SuccessPanel
              token={state.token}
              onInspect={openInInspector}
              pollCount={ciba.pollCount ?? 0}
            />
          )}

          {(ciba.status === "expired" || ciba.status === "denied") && (
            <Banner tone="warn" className="mt-4">
              <p className="font-medium">
                {ciba.status === "expired"
                  ? "Request expired."
                  : "Request denied."}
              </p>
              <p className="mt-1 text-muted-foreground">{ciba.errorMessage}</p>
            </Banner>
          )}

          {ciba.status === "error" && (
            <ErrorPanel
              className="mt-4"
              message={
                ciba.errorMessage ?? "Backchannel authentication failed."
              }
              status={ciba.errorStatus}
              body={ciba.errorBody}
            />
          )}
        </>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[11.5px] text-muted-foreground">
        {label}
        {required && <span className="ml-1 text-[var(--status-error)]">*</span>}
      </span>
      {children}
    </label>
  );
}

// scope + authorization_details both come from Auth request (one source of
// truth); this shows what CIBA will carry and links back to edit them.
function GrantSummary({
  scopes,
  rarEnabled,
  rarText,
  onEdit,
}: {
  scopes: string[];
  rarEnabled: boolean;
  rarText: string;
  onEdit: () => void;
}) {
  const parsed =
    rarEnabled && rarText.trim() ? parseAuthorizationDetails(rarText) : null;
  return (
    <div className="space-y-2 rounded-md border border-border bg-background/40 p-3">
      <div>
        <span className="font-mono text-[11px] text-muted-foreground">
          scope
        </span>
        <p className="font-mono text-[12.5px]">
          {scopes.length ? scopes.join(" ") : "none selected"}
        </p>
      </div>
      <div>
        <span className="font-mono text-[11px] text-muted-foreground">
          authorization_details
        </span>
        {parsed?.ok ? (
          <div className="mt-1">
            <AuthorizationDetailChips details={parsed.details} />
          </div>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">
            {rarEnabled
              ? "enabled — check the JSON in Auth request"
              : "off (RAR)"}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="text-[11.5px] text-[var(--playground-accent)] hover:underline"
      >
        edit in Auth request →
      </button>
    </div>
  );
}

function PendingPanel({
  authReqId,
  interval,
  pollCount,
  lastResult,
  remaining,
}: {
  authReqId?: string;
  interval: number;
  pollCount: number;
  lastResult?: "authorization_pending" | "slow_down";
  remaining: number | null;
}) {
  const expired = remaining !== null && remaining <= 0;
  return (
    <Banner tone={expired ? "warn" : "info"} className="mt-4 p-4 text-[13px]">
      <p className="flex items-center gap-1.5 font-medium">
        <RadioTower className="h-4 w-4 text-[var(--playground-accent)]" />
        Waiting for approval…
      </p>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        Polling every {interval}s — approve on the authentication device.
      </p>
      <dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-[12px]">
        <dt className="uppercase tracking-wide text-muted-foreground">
          auth_req_id
        </dt>
        <dd className="truncate font-mono">{authReqId ?? "—"}</dd>
        <dt className="uppercase tracking-wide text-muted-foreground">polls</dt>
        <dd className="font-mono">
          {pollCount}
          {lastResult && (
            <span className="ml-2 text-muted-foreground">
              (last: {lastResult})
            </span>
          )}
        </dd>
        <dt className="uppercase tracking-wide text-muted-foreground">
          expires in
        </dt>
        <dd className="font-mono">
          {remaining !== null ? formatDuration(remaining) : "—"}
        </dd>
      </dl>
    </Banner>
  );
}

function SuccessPanel({
  token,
  onInspect,
  pollCount,
}: {
  token: ReturnType<typeof usePlayground>["state"]["token"];
  onInspect: (source: "access" | "id" | "refresh") => void;
  pollCount: number;
}) {
  return (
    <div className="mt-4 space-y-3">
      <Banner tone="success" className="p-3 text-[13px]">
        <p className="flex items-center gap-1.5 font-medium">
          <Check className="h-4 w-4 text-[var(--status-success)]" />
          Approved — tokens issued after {pollCount}{" "}
          {pollCount === 1 ? "poll" : "polls"}.
        </p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Same tokens as the redirect flow — downstream steps now use them.
        </p>
      </Banner>
      {token.accessToken && (
        <TokenRow
          label="access_token"
          tag={
            looksLikeJwt(token.accessToken)
              ? "JWT"
              : `opaque · ${token.tokenType ?? "Bearer"}`
          }
          value={token.accessToken}
          onInspect={
            looksLikeJwt(token.accessToken)
              ? () => onInspect("access")
              : undefined
          }
        />
      )}
      {token.idToken && (
        <TokenRow
          label="id_token"
          tag="JWT (OIDC)"
          value={token.idToken}
          onInspect={() => onInspect("id")}
        />
      )}
      {token.refreshToken && (
        <TokenRow
          label="refresh_token"
          tag={looksLikeJwt(token.refreshToken) ? "JWT" : "opaque"}
          value={token.refreshToken}
          onInspect={
            looksLikeJwt(token.refreshToken)
              ? () => onInspect("refresh")
              : undefined
          }
        />
      )}
      {token.scope && (
        <div className="rounded-md border border-border bg-card/40 p-3 text-[12.5px]">
          <span className="text-muted-foreground">granted scope · </span>
          <span className="font-mono">{token.scope}</span>
        </div>
      )}
    </div>
  );
}

function TokenRow({
  label,
  tag,
  value,
  onInspect,
}: {
  label: string;
  tag: string;
  value: string;
  onInspect?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };
  return (
    <div className="rounded-md border border-border bg-card/40 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] font-medium">{label}</span>
        <span className="rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
          {tag}
        </span>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={copy}>
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </Button>
        {onInspect && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onInspect}
            className="text-[var(--playground-accent)]"
          >
            Inspect →
          </Button>
        )}
      </div>
      <code className="mt-2 block break-all rounded-sm bg-background/60 p-2 font-mono text-[11.5px] leading-relaxed">
        {value.length > 200 ? `${value.slice(0, 200)}…` : value}
      </code>
    </div>
  );
}

function renderPill(
  status: ReturnType<typeof usePlayground>["state"]["ciba"]["status"],
  remaining: number | null,
) {
  if (status === "idle") return null;
  if (status === "starting")
    return (
      <StatusPill tone="muted" spinning>
        requesting
      </StatusPill>
    );
  if (status === "pending") {
    const label =
      remaining !== null
        ? `polling · ${formatDuration(remaining)} left`
        : "polling";
    return (
      <StatusPill tone="muted" spinning>
        {label}
      </StatusPill>
    );
  }
  if (status === "success")
    return <StatusPill tone="success">tokens issued</StatusPill>;
  const tone: StatusTone = status === "error" ? "error" : "warn";
  const label =
    status === "expired"
      ? "expired"
      : status === "denied"
        ? "denied"
        : "failed";
  return <StatusPill tone={tone}>{label}</StatusPill>;
}
