import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CircleAlert,
  Copy,
  ExternalLink,
  Loader2,
  RotateCw,
  X,
} from "lucide-react";
import { usePlayground } from "../store/playground";
import { Button } from "../components/ui/Button";
import {
  Banner,
  InfoCard,
  KV,
  KVList,
  RequestPreview,
  StatusPill,
  StepHeader,
  type StatusTone,
} from "../components/step";
import { shorten } from "../lib/format";
import { cn } from "../lib/cn";
import { buildAuthorizeUrl } from "../lib/authorizeUrl";
import { previewAuthorize } from "../lib/requestPreview";
import { computeCodeChallenge, generateCodeVerifier } from "../lib/pkce";
import { randomBase64Url } from "../lib/random";
import {
  listenForCallback,
  openAuthorizeTab,
  type AuthorizeCallbackEvent,
} from "../lib/authorizeFlow";

export function AuthorizeStep() {
  const { state, authorizeUpdate, authRequestUpdate, setActiveStep } = usePlayground();
  const auth = state.authorize;
  const popupRef = useRef<Window | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [copied, setCopied] = useState(false);

  const parRequestUri =
    state.par.status === "success" ? state.par.requestUri : undefined;

  const built = buildAuthorizeUrl(
    state.discovery.metadata,
    state.client,
    state.authRequest,
    parRequestUri,
  );

  useEffect(() => {
    return () => {
      stopRef.current?.();
      stopRef.current = null;
    };
  }, []);

  const start = async () => {
    if (!built.ok) return;
    stopRef.current?.();

    // On retry without PAR, regenerate state / nonce / code_verifier so the
    // request isn't a replay of the previous (possibly already-consumed)
    // attempt. With PAR, the AS has already bound the params to request_uri,
    // so we must keep the existing values.
    let freshUrl = built.url;
    let freshState = state.authRequest.state;
    if (!parRequestUri) {
      freshState = randomBase64Url(16);
      const freshNonce = randomBase64Url(16);
      const patch: Partial<typeof state.authRequest> = {
        state: freshState,
        nonce: freshNonce,
      };
      if (state.authRequest.pkceEnabled) {
        const verifier = generateCodeVerifier();
        const challenge = await computeCodeChallenge(verifier);
        patch.codeVerifier = verifier;
        patch.codeChallenge = challenge;
      }
      authRequestUpdate(patch);
      const rebuilt = buildAuthorizeUrl(
        state.discovery.metadata,
        state.client,
        { ...state.authRequest, ...patch },
      );
      if (rebuilt.ok) freshUrl = rebuilt.url;
    }

    authorizeUpdate({
      status: "waiting",
      code: undefined,
      returnedState: undefined,
      iss: undefined,
      stateMatches: undefined,
      issMatches: undefined,
      error: undefined,
      errorDescription: undefined,
      errorUri: undefined,
      rawCallbackUrl: undefined,
      receivedAt: undefined,
      openedUrl: freshUrl,
    });

    stopRef.current = listenForCallback({
      expectedState: freshState,
      expectedIssuer: state.discovery.metadata?.issuer,
      onResult: handleResult,
    });

    popupRef.current = openAuthorizeTab(freshUrl);
  };

  const cancel = () => {
    stopRef.current?.();
    stopRef.current = null;
    authorizeUpdate({ status: "idle" });
    try {
      popupRef.current?.close();
    } catch {
      // ignore
    }
    popupRef.current = null;
  };

  function handleResult(event: AuthorizeCallbackEvent) {
    stopRef.current?.();
    stopRef.current = null;
    const { params, stateMatches, issMatches } = event;
    if (params.error) {
      authorizeUpdate({
        status: "error",
        returnedState: params.state,
        iss: params.iss,
        stateMatches,
        issMatches,
        error: params.error,
        errorDescription: params.error_description,
        errorUri: params.error_uri,
        rawCallbackUrl: params.raw,
        receivedAt: params.receivedAt,
      });
      return;
    }
    if (!stateMatches) {
      authorizeUpdate({
        status: "error",
        code: params.code,
        returnedState: params.state,
        iss: params.iss,
        stateMatches: false,
        issMatches,
        error: "state_mismatch",
        errorDescription:
          "The state value returned by the AS does not match the one this playground sent.",
        rawCallbackUrl: params.raw,
        receivedAt: params.receivedAt,
      });
      return;
    }
    authorizeUpdate({
      status: "received",
      code: params.code,
      returnedState: params.state,
      iss: params.iss,
      stateMatches: true,
      issMatches,
      rawCallbackUrl: params.raw,
      receivedAt: params.receivedAt,
    });
  }

  const onCopyCode = async () => {
    if (!auth.code) return;
    try {
      await navigator.clipboard.writeText(auth.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <StepHeader
        stepNumber={5}
        title="Authorize → Callback"
        right={renderPill(auth.status)}
      />

      {!built.ok && (
        <Banner tone="warn" className="mt-5">
          {built.message}
          <Button
            variant="ghost"
            size="sm"
            className="ml-2 text-[var(--playground-accent)]"
            onClick={() =>
              setActiveStep(state.authRequest.scopes.length ? "auth-request" : "discovery")
            }
          >
            Fix it →
          </Button>
        </Banner>
      )}

      {state.authRequest.state && (
        <InfoCard label="About to authorize" className="mt-5">
          <KVList className="mt-1">
            <KV label="mode">
              {parRequestUri
                ? `PAR (request_uri: ${shorten(parRequestUri, 18, 10)})`
                : "direct (no PAR)"}
            </KV>
            <KV label="state">
              <span className="font-mono">
                {shorten(state.authRequest.state, 14, 10)}
              </span>
            </KV>
            {state.authRequest.nonce && (
              <KV label="nonce">
                <span className="font-mono">
                  {shorten(state.authRequest.nonce, 14, 10)}
                </span>
              </KV>
            )}
          </KVList>
        </InfoCard>
      )}

      {built.ok && state.discovery.metadata?.authorization_endpoint && (
        <RequestPreview
          className="mt-3"
          block={previewAuthorize(
            state.discovery.metadata.authorization_endpoint,
            state.client,
            state.authRequest,
            parRequestUri,
          )}
        />
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {auth.status === "waiting" ? (
          <>
            <Button disabled>
              <Loader2 className="h-4 w-4 animate-spin" />
              Waiting for callback…
            </Button>
            <Button variant="secondary" onClick={cancel}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </>
        ) : auth.status === "received" || auth.status === "error" ? (
          <Button variant="secondary" onClick={start} disabled={!built.ok}>
            <RotateCw className="h-4 w-4" />
            Re-run
          </Button>
        ) : (
          <Button onClick={start} disabled={!built.ok}>
            <ExternalLink className="h-4 w-4" />
            Authorize ↗
          </Button>
        )}
      </div>

      {auth.status === "waiting" && (
        <p className="mt-3 text-[12.5px] text-muted-foreground">
          Opened a new tab to the AS. Complete the consent there; the playground
          will catch the callback automatically.
        </p>
      )}

      {auth.status === "received" && auth.code && (
        <ResultPanel auth={auth} onCopy={onCopyCode} copied={copied} />
      )}

      {auth.status === "error" && <ErrorPanel auth={auth} />}
    </div>
  );
}

function renderPill(status: "idle" | "waiting" | "received" | "error") {
  if (status === "idle") return null;
  const map: Record<Exclude<typeof status, "idle">, { tone: StatusTone; label: string; spinning?: boolean }> = {
    waiting: { tone: "muted", label: "waiting", spinning: true },
    received: { tone: "success", label: "code received" },
    error: { tone: "error", label: "failed" },
  };
  const p = map[status];
  return (
    <StatusPill tone={p.tone} spinning={p.spinning}>
      {p.label}
    </StatusPill>
  );
}

function ResultPanel({
  auth,
  onCopy,
  copied,
}: {
  auth: ReturnType<typeof usePlayground>["state"]["authorize"];
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <Banner tone="success" className="mt-4 p-4">
      <p className="flex items-center gap-1.5 text-[13.5px] font-medium">
        <Check className="h-4 w-4 text-[var(--status-success)]" />
        Authorization code received.
      </p>
      <KVList className="mt-3">
        <KV label="code">
          <div className="flex flex-1 items-center gap-2">
            <code className="flex-1 truncate font-mono text-[12px]">
              {auth.code}
            </code>
            <Button variant="ghost" size="sm" onClick={onCopy} className="shrink-0">
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
        </KV>
        <KV label="state">
          <span className="inline-flex items-center gap-1.5">
            {auth.stateMatches ? (
              <Check className="h-3.5 w-3.5 text-[var(--status-success)]" />
            ) : (
              <X className="h-3.5 w-3.5 text-[var(--status-error)]" />
            )}
            <span className="font-mono">
              {shorten(auth.returnedState ?? "", 14, 10)}
            </span>
            <span className="text-muted-foreground">
              {auth.stateMatches ? "matches" : "MISMATCH"}
            </span>
          </span>
        </KV>
        {auth.iss && (
          <KV label="iss">
            <span className="inline-flex items-center gap-1.5">
              {auth.issMatches === true ? (
                <Check className="h-3.5 w-3.5 text-[var(--status-success)]" />
              ) : auth.issMatches === false ? (
                <AlertTriangle className="h-3.5 w-3.5 text-[var(--status-warn)]" />
              ) : null}
              <span className="font-mono">{auth.iss}</span>
              <span className="text-muted-foreground">(RFC 9207)</span>
            </span>
          </KV>
        )}
      </KVList>
      <p className="mt-3 text-[12px] text-muted-foreground">
        Next: step 6 exchanges this code for tokens at{" "}
        <code className="font-mono">/token</code>.
      </p>
    </Banner>
  );
}

function ErrorPanel({
  auth,
}: {
  auth: ReturnType<typeof usePlayground>["state"]["authorize"];
}) {
  const isStateMismatch = auth.error === "state_mismatch";
  return (
    <Banner tone="error" className={cn("mt-4 p-4")}>
      <p className="flex items-center gap-1.5 text-[13.5px] font-medium">
        <CircleAlert className="h-4 w-4 text-[var(--status-error)]" />
        {isStateMismatch
          ? "State mismatch — possible CSRF or stale tab."
          : `AS returned error: ${auth.error}`}
      </p>
      {auth.errorDescription && (
        <p className="mt-1 text-[13px] text-muted-foreground">
          {auth.errorDescription}
        </p>
      )}
      {(auth.returnedState || auth.iss) && (
        <KVList className="mt-3">
          {auth.returnedState && (
            <KV label="state">
              <span className="font-mono">
                {shorten(auth.returnedState, 14, 10)}
              </span>
            </KV>
          )}
          {auth.iss && (
            <KV label="iss">
              <span className="font-mono">{auth.iss}</span>
            </KV>
          )}
        </KVList>
      )}
      {auth.errorUri && (
        <p className="mt-2 text-[12px]">
          <a
            href={auth.errorUri}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--playground-accent)] underline"
          >
            error_uri ↗
          </a>
        </p>
      )}
    </Banner>
  );
}

