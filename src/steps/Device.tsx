import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  MonitorSmartphone,
  RotateCw,
  Send,
  Square,
} from "lucide-react";
import { usePlayground } from "../store/playground";
import { Button } from "../components/ui/Button";
import {
  Banner,
  ErrorPanel,
  GrantSummary,
  RequestPreview,
  Section,
  StatusPill,
  StepHeader,
  type StatusTone,
} from "../components/step";
import { formatDuration } from "../protocol/format";
import { looksLikeJwt } from "../protocol/jwt";
import { validateClientConfig } from "../protocol/clientConfig";
import { previewDevice } from "../protocol/requestPreview";
import { startDeviceAuthorization } from "../protocol/deviceAuth";
import { pollDeviceToken } from "../protocol/devicePoll";
import { dpopContextFrom } from "../protocol/dpop";

export function DeviceStep() {
  const {
    state,
    deviceUpdate,
    deviceReset,
    tokenUpdate,
    inspectorUpdate,
    setActiveStep,
    networkAdd,
    networkUpdate,
    dpopUpdate,
  } = usePlayground();
  const device = state.device;
  const metadata = state.discovery.metadata;
  const endpoint = metadata?.device_authorization_endpoint;
  const client = state.client;
  const authRequest = state.authRequest;

  const [remaining, setRemaining] = useState<number | null>(null);

  // Countdown to device_code expiry while polling.
  useEffect(() => {
    if (device.status !== "pending" || !device.startedAt || !device.expiresIn) {
      setRemaining(null);
      return;
    }
    const update = () => {
      const left =
        device.expiresIn! - Math.floor((Date.now() - device.startedAt!) / 1000);
      setRemaining(Math.max(0, left));
    };
    update();
    const t = window.setInterval(update, 1000);
    return () => window.clearInterval(t);
  }, [device.status, device.startedAt, device.expiresIn]);

  // Poll loop — keyed on status + device_code so per-poll updates don't restart
  // it; the cancellation flag stops it on stop / unmount / strict-mode remount.
  useEffect(() => {
    if (device.status !== "pending" || !device.deviceCode || !metadata) return;
    const ctl = { cancelled: false };
    let interval = device.interval ?? 5;
    let count = device.pollCount ?? 0;
    const deadline =
      device.startedAt && device.expiresIn
        ? device.startedAt + device.expiresIn * 1000
        : undefined;
    let timer = 0;

    const tick = async () => {
      if (ctl.cancelled) return;
      if (deadline && Date.now() >= deadline) {
        deviceUpdate({
          status: "expired",
          errorMessage: "The device_code expired before the user approved.",
        });
        return;
      }
      count += 1;
      deviceUpdate({ pollCount: count });
      const outcome = await pollDeviceToken({
        metadata,
        client,
        deviceCode: device.deviceCode!,
        dpop: dpopContextFrom(state.dpop),
        onDpopNonce: (nonce) => dpopUpdate({ nonce }),
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
          deviceUpdate({ status: "success", lastResult: undefined });
          return;
        }
        case "pending":
          deviceUpdate({ lastResult: "authorization_pending" });
          break;
        case "slow_down":
          interval += 5;
          deviceUpdate({ lastResult: "slow_down", interval });
          break;
        case "expired":
          deviceUpdate({ status: "expired", errorMessage: outcome.message });
          return;
        case "denied":
          deviceUpdate({ status: "denied", errorMessage: outcome.message });
          return;
        case "error":
          deviceUpdate({
            status: "error",
            errorMessage: outcome.message,
            errorStatus: outcome.status,
            errorBody: outcome.body,
          });
          return;
      }
      if (!ctl.cancelled) timer = window.setTimeout(tick, interval * 1000);
    };
    // First poll after one interval, as a real device paces itself.
    timer = window.setTimeout(tick, interval * 1000);
    return () => {
      ctl.cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.status, device.deviceCode]);

  const clientValid = validateClientConfig(client).ok;
  const hasScopes = authRequest.scopes.length > 0;
  const canStart =
    !!endpoint &&
    clientValid &&
    hasScopes &&
    device.status !== "starting" &&
    device.status !== "pending";

  const onStart = async () => {
    if (!metadata || !endpoint || !canStart) return;
    deviceUpdate({
      status: "starting",
      deviceCode: undefined,
      userCode: undefined,
      verificationUri: undefined,
      verificationUriComplete: undefined,
      expiresIn: undefined,
      interval: undefined,
      startedAt: undefined,
      pollCount: 0,
      lastResult: undefined,
      errorMessage: undefined,
      errorStatus: undefined,
      errorBody: undefined,
    });
    const result = await startDeviceAuthorization({
      metadata,
      client,
      authRequest,
      onStart: networkAdd,
      onFinish: networkUpdate,
    });
    if (result.ok) {
      deviceUpdate({
        status: "pending",
        deviceCode: result.deviceCode,
        userCode: result.userCode,
        verificationUri: result.verificationUri,
        verificationUriComplete: result.verificationUriComplete,
        expiresIn: result.expiresIn,
        interval: result.interval,
        startedAt: Date.now(),
        pollCount: 0,
      });
    } else {
      deviceUpdate({
        status: "error",
        errorMessage: result.message,
        errorStatus: result.status,
        errorBody: result.body,
      });
    }
  };

  const onStop = () => deviceReset();

  const openInInspector = (source: "access" | "id" | "refresh") => {
    inspectorUpdate({ source });
    setActiveStep("inspect");
  };

  return (
    <div className="mx-auto max-w-3xl @4xl:max-w-5xl">
      <StepHeader step="device" right={renderPill(device.status, remaining)} />

      <p className="mt-4 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
        The playground stands in for a device with no browser. It asks the AS
        for a short user code, shows it to you, then polls the token endpoint
        while you enter that code and approve on a second device (a phone or
        laptop) at the verification URL below.
      </p>

      {!endpoint && (
        <Banner tone="error" className="mt-4">
          No <code className="font-mono">device_authorization_endpoint</code> in
          discovery — this AS doesn't support the device flow.
        </Banner>
      )}

      {endpoint && (
        <>
          <Section
            title="Device authorization request"
            description="What to grant. There's no redirect URI and no login_hint; the user is identified when they sign in at the verification URL."
            className="mt-4"
          >
            <GrantSummary
              scopes={authRequest.scopes}
              rar={{
                enabled: authRequest.authorizationDetailsEnabled,
                text: authRequest.authorizationDetails,
              }}
              onEdit={() => setActiveStep("auth-request")}
            />
          </Section>

          <RequestPreview
            className="mt-4"
            block={previewDevice(endpoint, client, authRequest)}
          />

          {!hasScopes && (
            <Banner tone="warn" className="mt-4">
              Select at least one scope in Auth request.
            </Banner>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {device.status === "starting" ? (
              <Button disabled>
                <Loader2 className="h-4 w-4 animate-spin" />
                Requesting…
              </Button>
            ) : device.status === "pending" ? (
              <Button variant="secondary" onClick={onStop}>
                <Square className="h-4 w-4" />
                Stop polling
              </Button>
            ) : device.status === "success" ? (
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
                Request device code
              </Button>
            )}
            {device.status === "success" && (
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

          {device.status === "pending" && (
            <PendingPanel
              userCode={device.userCode}
              verificationUri={device.verificationUri}
              verificationUriComplete={device.verificationUriComplete}
              interval={device.interval ?? 5}
              pollCount={device.pollCount ?? 0}
              lastResult={device.lastResult}
              remaining={remaining}
            />
          )}

          {device.status === "success" && (
            <SuccessPanel
              token={state.token}
              onInspect={openInInspector}
              pollCount={device.pollCount ?? 0}
            />
          )}

          {(device.status === "expired" || device.status === "denied") && (
            <Banner tone="warn" className="mt-4">
              <p className="font-medium">
                {device.status === "expired"
                  ? "Request expired."
                  : "Request denied."}
              </p>
              <p className="mt-1 text-muted-foreground">
                {device.errorMessage}
              </p>
            </Banner>
          )}

          {device.status === "error" && (
            <ErrorPanel
              className="mt-4"
              message={device.errorMessage ?? "Device authorization failed."}
              status={device.errorStatus}
              body={device.errorBody}
            />
          )}
        </>
      )}
    </div>
  );
}

function PendingPanel({
  userCode,
  verificationUri,
  verificationUriComplete,
  interval,
  pollCount,
  lastResult,
  remaining,
}: {
  userCode?: string;
  verificationUri?: string;
  verificationUriComplete?: string;
  interval: number;
  pollCount: number;
  lastResult?: "authorization_pending" | "slow_down";
  remaining: number | null;
}) {
  const expired = remaining !== null && remaining <= 0;
  // verification_uri_complete embeds the code, so one tap finishes it; fall
  // back to the plain URI (user types the code) when the AS omits it.
  const openTarget = verificationUriComplete ?? verificationUri;
  return (
    <Banner tone={expired ? "warn" : "info"} className="mt-4 p-4 text-[13px]">
      <p className="flex items-center gap-1.5 font-medium">
        <MonitorSmartphone className="h-4 w-4 text-[var(--playground-accent)]" />
        Waiting for approval…
      </p>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        Go to the verification URL on a second device, enter the code, and
        approve. Polling every {interval}s.
      </p>

      <div className="mt-3 flex flex-col gap-3 @2xl:flex-row @2xl:items-stretch">
        <UserCodeCard userCode={userCode} />
        <VerificationCard
          verificationUri={verificationUri}
          openTarget={openTarget}
          hasComplete={!!verificationUriComplete}
        />
      </div>

      <dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-[12px]">
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

// The user_code is the thing the human reads off this screen — make it the
// biggest, most copyable element on the panel.
function UserCodeCard({ userCode }: { userCode?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!userCode) return;
    try {
      await navigator.clipboard.writeText(userCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };
  return (
    <div className="flex-1 rounded-md border border-border bg-background/60 p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          user_code
        </span>
        <Button variant="ghost" size="sm" onClick={copy} disabled={!userCode}>
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
      </div>
      <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.2em] text-foreground">
        {userCode ?? "—"}
      </p>
    </div>
  );
}

function VerificationCard({
  verificationUri,
  openTarget,
  hasComplete,
}: {
  verificationUri?: string;
  openTarget?: string;
  hasComplete: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col rounded-md border border-border bg-background/60 p-3">
      <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
        verification_uri
      </span>
      <p className="mt-1 break-all font-mono text-[12.5px]">
        {verificationUri ?? "—"}
      </p>
      {openTarget && (
        <a
          href={openTarget}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 self-start rounded-md border border-border px-2.5 py-1 text-[12px] text-[var(--playground-accent)] hover:bg-accent"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {hasComplete ? "Open with code pre-filled" : "Open verification page"}
        </a>
      )}
    </div>
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
  status: ReturnType<typeof usePlayground>["state"]["device"]["status"],
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
