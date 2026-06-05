import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
  RotateCw,
  Send,
} from "lucide-react";
import { usePlayground } from "../store/playground";
import { Button } from "../components/ui/Button";
import {
  Banner,
  ErrorPanel,
  KV,
  KVList,
  RequestPreview,
  StatusPill,
  StepHeader,
  type StatusTone,
} from "../components/step";
import { previewPar } from "../lib/requestPreview";
import { pushPar } from "../lib/parClient";

export function ParStep() {
  const {
    state,
    parUpdate,
    networkAdd,
    networkUpdate,
    setActiveStep,
  } = usePlayground();
  const par = state.par;
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (par.status !== "success" || !par.pushedAt || !par.expiresIn) {
      setRemaining(null);
      return;
    }
    const update = () => {
      const elapsed = Math.floor((Date.now() - par.pushedAt!) / 1000);
      const left = (par.expiresIn ?? 0) - elapsed;
      setRemaining(Math.max(0, left));
    };
    update();
    const t = window.setInterval(update, 1000);
    return () => window.clearInterval(t);
  }, [par.status, par.pushedAt, par.expiresIn]);

  const parEndpoint =
    state.discovery.metadata?.pushed_authorization_request_endpoint;
  const canPush =
    par.enabled &&
    !!parEndpoint &&
    state.stepStatus.client === "done" &&
    state.authRequest.scopes.length > 0;

  const onPush = async () => {
    if (!state.discovery.metadata || !canPush) return;
    parUpdate({
      status: "loading",
      requestUri: undefined,
      expiresIn: undefined,
      pushedAt: undefined,
      errorMessage: undefined,
      errorStatus: undefined,
      errorBody: undefined,
    });
    const result = await pushPar({
      metadata: state.discovery.metadata,
      client: state.client,
      authRequest: state.authRequest,
      onStart: networkAdd,
      onFinish: networkUpdate,
    });
    if (result.ok) {
      parUpdate({
        status: "success",
        requestUri: result.requestUri,
        expiresIn: result.expiresIn,
        pushedAt: Date.now(),
      });
    } else {
      parUpdate({
        status: "error",
        errorMessage: result.message,
        errorStatus: result.status,
        errorBody: result.body,
      });
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Header status={par.status} enabled={par.enabled} remaining={remaining} />

      {!par.enabled && (
        <Banner tone="info" className="mt-5 text-[12.5px] text-muted-foreground">
          <p>
            PAR is off — toggle <span className="font-medium text-foreground">PAR (RFC 9126)</span>{" "}
            in step 3's Extensions row to enable it.
          </p>
          <p className="mt-1">Step 5 will use the full URL from step 3.</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-[var(--playground-accent)]"
            onClick={() => setActiveStep("authorize")}
          >
            Continue to Authorize →
          </Button>
        </Banner>
      )}

      {par.enabled && !parEndpoint && (
        <Banner tone="error" className="mt-5">
          <p className="font-medium">This AS doesn't support PAR.</p>
          <p className="mt-1 text-muted-foreground">
            Discovery metadata has no{" "}
            <code className="font-mono">pushed_authorization_request_endpoint</code>.
            Toggle PAR off in step 3, or pick an AS that advertises one.
          </p>
        </Banner>
      )}

      {par.enabled && parEndpoint && state.discovery.metadata && (
        <>
          <RequestPreview
            className="mt-5"
            block={previewPar(parEndpoint, state.client, state.authRequest)}
          />

          <div className="mt-5 flex flex-wrap gap-2">
            {par.status === "loading" ? (
              <Button disabled>
                <Loader2 className="h-4 w-4 animate-spin" />
                Pushing…
              </Button>
            ) : par.status === "success" ? (
              <Button variant="secondary" onClick={onPush} disabled={!canPush}>
                <RotateCw className="h-4 w-4" />
                Re-push
              </Button>
            ) : (
              <Button onClick={onPush} disabled={!canPush}>
                <Send className="h-4 w-4" />
                Push to /par
              </Button>
            )}
            {par.status === "success" && (
              <Button
                variant="ghost"
                onClick={() => setActiveStep("authorize")}
                className="text-[var(--playground-accent)]"
              >
                <ArrowRight className="h-4 w-4" />
                Continue to Authorize
              </Button>
            )}
          </div>

          {par.status === "success" && par.requestUri && (
            <SuccessPanel
              requestUri={par.requestUri}
              expiresIn={par.expiresIn ?? 0}
              remaining={remaining}
            />
          )}

          {par.status === "error" && (
            <ErrorPanel
              className="mt-4"
              message={par.errorMessage ?? "Unknown error."}
              status={par.errorStatus}
              body={par.errorBody}
            />
          )}
        </>
      )}
    </div>
  );
}

function Header({
  status,
  enabled,
  remaining,
}: {
  status: ReturnType<typeof usePlayground>["state"]["par"]["status"];
  enabled: boolean;
  remaining: number | null;
}) {
  return (
    <StepHeader
      stepNumber={4}
      title="PAR push"
      titleSuffix={!enabled ? "(off — enable in step 3)" : undefined}
      right={renderPill(status, remaining)}
    />
  );
}

function renderPill(
  status: ReturnType<typeof usePlayground>["state"]["par"]["status"],
  remaining: number | null,
) {
  if (status === "idle") return null;
  if (status === "loading")
    return (
      <StatusPill tone="muted" spinning>
        pushing
      </StatusPill>
    );
  if (status === "success") {
    const expired = remaining !== null && remaining <= 0;
    const tone: StatusTone = expired ? "warn" : "success";
    return (
      <StatusPill tone={tone}>
        {expired
          ? "expired"
          : remaining !== null
            ? `request_uri · ${remaining}s left`
            : "request_uri ready"}
      </StatusPill>
    );
  }
  return <StatusPill tone="error">failed</StatusPill>;
}

function SuccessPanel({
  requestUri,
  expiresIn,
  remaining,
}: {
  requestUri: string;
  expiresIn: number;
  remaining: number | null;
}) {
  const expired = remaining !== null && remaining <= 0;
  return (
    <Banner tone={expired ? "warn" : "success"} className="mt-4 p-4 text-[13.5px]">
      <p className="flex items-center gap-1.5 font-medium">
        {expired ? (
          <AlertTriangle className="h-4 w-4 text-[var(--status-warn)]" />
        ) : (
          <Check className="h-4 w-4 text-[var(--status-success)]" />
        )}
        {expired
          ? "request_uri has expired — push again before step 5."
          : "request_uri received."}
      </p>
      <KVList className="mt-3">
        <KV label="request_uri" labelWidth="w-24">
          <code className="break-all font-mono text-[12px]">{requestUri}</code>
        </KV>
        <KV label="expires_in" labelWidth="w-24">
          <span className="font-mono">{expiresIn}s</span>
          {remaining !== null && !expired && (
            <span className="ml-2 text-muted-foreground">
              ({remaining}s remaining)
            </span>
          )}
        </KV>
      </KVList>
    </Banner>
  );
}
