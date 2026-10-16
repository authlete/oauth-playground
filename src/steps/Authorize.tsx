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
import { shorten } from "../protocol/format";
import { cn } from "../protocol/cn";
import { buildAuthorizeUrl } from "../protocol/authorizeUrl";
import { jarReadiness } from "../protocol/requestObject";
import { previewAuthorize } from "../protocol/requestPreview";
import { computeCodeChallenge, generateCodeVerifier } from "../protocol/pkce";
import { randomBase64Url } from "../protocol/random";
import {
  listenForCallback,
  openAuthorizeTab,
  type AuthorizeCallbackEvent,
} from "../protocol/authorizeFlow";

export function AuthorizeStep() {
  const {
    state,
    authorizeUpdate,
    authRequestUpdate,
    setActiveStep,
    setAutoExchange,
  } = usePlayground();
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
  const jarReady = jarReadiness(state.client, state.authRequest);
  // When JAR is on, the signed object must be present (the store signs it);
  // built.url only carries `request` once requestObjectJwt exists.
  const jarPending =
    state.authRequest.jarEnabled && !state.authRequest.requestObjectJwt;
  const canAuthorize = built.ok && jarReady.ok && !jarPending;

  useEffect(() => {
    return () => {
      stopRef.current?.();
      stopRef.current = null;
    };
  }, []);

  const start = async () => {
    if (!canAuthorize) return;
    stopRef.current?.();

    let freshUrl = built.url;
    let freshState = state.authRequest.state;

    // Plain request only: on (re)run, regenerate state / nonce / code_verifier
    // so the request isn't a replay of a previous (possibly consumed) attempt.
    // With PAR the AS already bound the params to request_uri; with JAR the
    // params (incl. state/nonce) are bound inside the signed object built.url
    // already carries, so both keep the existing values.
    if (!parRequestUri && !state.authRequest.jarEnabled) {
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
    <div className="mx-auto max-w-3xl @4xl:max-w-5xl">
      <StepHeader
        step="authorize"
        titleSuffix="opens the AS, catches the callback"
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
              setActiveStep(
                state.authRequest.scopes.length ? "auth-request" : "discovery",
              )
            }
          >
            Fix it →
          </Button>
        </Banner>
      )}

      {built.ok && !jarReady.ok && (
        <Banner tone="warn" className="mt-5">
          {jarReady.message}
          <Button
            variant="ghost"
            size="sm"
            className="ml-2 text-[var(--playground-accent)]"
            onClick={() => setActiveStep("client")}
          >
            Fix it →
          </Button>
        </Banner>
      )}

      {state.authRequest.state && (
        <InfoCard
          label="About to authorize"
          description="Parameters bound at Auth request; the browser opens the AS next."
          className="mt-5"
        >
          <KVList className="mt-1">
            {/* How the authorization request parameters reach the AS — only
                spec terms: query params (RFC 6749, Section 4.1.1), request object by
                value (JAR, RFC 9101), or by reference (PAR, RFC 9126). */}
            <KV label="parameters">
              {parRequestUri ? (
                <>
                  by reference — request_uri (PAR, RFC 9126){" "}
                  <span className="font-mono">
                    {shorten(parRequestUri, 18, 10)}
                  </span>
                </>
              ) : state.authRequest.jarEnabled ? (
                "by value — signed request object (JAR, RFC 9101)"
              ) : (
                "query parameters (RFC 6749, Section 4.1.1)"
              )}
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

      <div className="mt-5 space-y-3">
        {/* The option goes above the action it affects, not after it. Only
            shown when the Authorize button is actionable. */}
        {(auth.status === "idle" || auth.status === "error") && (
          <label className="flex cursor-pointer items-start gap-2 text-[12.5px]">
            <input
              type="checkbox"
              checked={state.autoExchange}
              onChange={(e) => setAutoExchange(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-[var(--playground-accent)]"
            />
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">
                Exchange the code for tokens automatically
              </span>{" "}
              and open Token exchange. Turn off to stay here and inspect the
              authorization result, then exchange by hand.
            </span>
          </label>
        )}

        <div className="flex flex-wrap gap-2">
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
            <Button
              variant="secondary"
              onClick={start}
              disabled={!canAuthorize}
            >
              <RotateCw className="h-4 w-4" />
              Re-run
            </Button>
          ) : (
            <Button onClick={start} disabled={!canAuthorize}>
              <ExternalLink className="h-4 w-4" />
              Authorize ↗
            </Button>
          )}
        </div>
      </div>

      {auth.status === "waiting" && (
        <p className="mt-3 text-[12.5px] text-muted-foreground">
          Opened a new tab to the AS. Complete the consent there; the playground
          will catch the callback automatically.
        </p>
      )}

      {auth.status === "received" && auth.code && (
        <ResultPanel
          auth={auth}
          onCopy={onCopyCode}
          copied={copied}
          autoExchange={state.autoExchange}
          tokenStatus={state.token.status}
          onInspectTokens={() => setActiveStep("token")}
        />
      )}

      {auth.status === "error" && <ErrorPanel auth={auth} />}
    </div>
  );
}

function renderPill(status: "idle" | "waiting" | "received" | "error") {
  if (status === "idle") return null;
  const map: Record<
    Exclude<typeof status, "idle">,
    { tone: StatusTone; label: string; spinning?: boolean }
  > = {
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
  autoExchange,
  tokenStatus,
  onInspectTokens,
}: {
  auth: ReturnType<typeof usePlayground>["state"]["authorize"];
  onCopy: () => void;
  copied: boolean;
  autoExchange: boolean;
  tokenStatus: ReturnType<typeof usePlayground>["state"]["token"]["status"];
  onInspectTokens: () => void;
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
            <Button
              variant="ghost"
              size="sm"
              onClick={onCopy}
              className="shrink-0"
            >
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
      <TokenOutcome
        autoExchange={autoExchange}
        tokenStatus={tokenStatus}
        onInspectTokens={onInspectTokens}
      />
    </Banner>
  );
}

// What became of the code — kept deliberately quiet so it doesn't pull focus
// from the authorization result above, which is the part worth reading.
function TokenOutcome({
  autoExchange,
  tokenStatus,
  onInspectTokens,
}: {
  autoExchange: boolean;
  tokenStatus: ReturnType<typeof usePlayground>["state"]["token"]["status"];
  onInspectTokens: () => void;
}) {
  if (!autoExchange) {
    return (
      <p className="mt-3 flex items-center gap-1 text-[12px] text-muted-foreground">
        Token exchange trades this code for tokens.
        <Button
          variant="ghost"
          size="sm"
          onClick={onInspectTokens}
          className="text-[var(--playground-accent)]"
        >
          Go to Token exchange →
        </Button>
      </p>
    );
  }
  if (tokenStatus === "loading") {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Exchanging the code for tokens…
      </p>
    );
  }
  if (tokenStatus === "success") {
    return (
      <p className="mt-3 flex items-center gap-1 text-[12px] text-muted-foreground">
        <Check className="h-3.5 w-3.5 text-[var(--status-success)]" />
        Tokens received.
        <Button
          variant="ghost"
          size="sm"
          onClick={onInspectTokens}
          className="text-[var(--playground-accent)]"
        >
          Inspect tokens →
        </Button>
      </p>
    );
  }
  if (tokenStatus === "error") {
    return (
      <p className="mt-3 flex items-center gap-1 text-[12px] text-muted-foreground">
        <CircleAlert className="h-3.5 w-3.5 text-[var(--status-error)]" />
        Token exchange failed.
        <Button
          variant="ghost"
          size="sm"
          onClick={onInspectTokens}
          className="text-[var(--playground-accent)]"
        >
          See why →
        </Button>
      </p>
    );
  }
  return null;
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
