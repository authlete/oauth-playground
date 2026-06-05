import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  KeyRound,
  Loader2,
  RotateCw,
} from "lucide-react";
import { usePlayground } from "../store/playground";
import { Button } from "../components/ui/Button";
import {
  Banner,
  ErrorPanel,
  InfoCard,
  KVGrid,
  KVRow,
  StatusPill,
  StepHeader,
  type StatusTone,
} from "../components/step";
import { formatDuration, shorten } from "../lib/format";
import { looksLikeJwt } from "../lib/jwt";
import { exchangeCode } from "../lib/tokenExchange";

export function TokenStep() {
  const {
    state,
    tokenUpdate,
    inspectorUpdate,
    setActiveStep,
    networkAdd,
    networkUpdate,
  } = usePlayground();
  const tok = state.token;
  const [copied, setCopied] = useState<"access" | "id" | "refresh" | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (tok.status !== "success" || !tok.expiresAt) {
      setSecondsLeft(null);
      return;
    }
    const update = () =>
      setSecondsLeft(Math.max(0, Math.round((tok.expiresAt! - Date.now()) / 1000)));
    update();
    const t = window.setInterval(update, 1000);
    return () => window.clearInterval(t);
  }, [tok.status, tok.expiresAt]);

  const tokenEndpoint = state.discovery.metadata?.token_endpoint;
  const code = state.authorize.code;
  const canExchange =
    !!tokenEndpoint && !!code && state.authorize.status === "received";

  const onExchange = async () => {
    if (!state.discovery.metadata || !code || !canExchange) return;
    tokenUpdate({
      status: "loading",
      error: undefined,
      errorDescription: undefined,
      errorBody: undefined,
      errorStatus: undefined,
    });
    const result = await exchangeCode({
      metadata: state.discovery.metadata,
      client: state.client,
      authRequest: state.authRequest,
      code,
      onStart: networkAdd,
      onFinish: networkUpdate,
    });
    if (result.ok) {
      const expiresAt =
        typeof result.expiresIn === "number"
          ? Date.now() + result.expiresIn * 1000
          : undefined;
      tokenUpdate({
        status: "success",
        accessToken: result.accessToken,
        tokenType: result.tokenType,
        expiresIn: result.expiresIn,
        expiresAt,
        refreshToken: result.refreshToken,
        idToken: result.idToken,
        scope: result.scope,
        exchangedAt: Date.now(),
      });
    } else {
      tokenUpdate({
        status: "error",
        error: result.error,
        errorDescription: result.errorDescription,
        errorStatus: result.status,
        errorBody: result.body,
      });
    }
  };

  const copy = async (kind: "access" | "id" | "refresh", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(
        () => setCopied((cur) => (cur === kind ? null : cur)),
        1500,
      );
    } catch {
      // ignore
    }
  };

  const openInInspector = (source: "access" | "id" | "refresh") => {
    inspectorUpdate({ source });
    setActiveStep("inspect");
  };

  return (
    <div className="mx-auto max-w-3xl">
      <StepHeader
        stepNumber={6}
        title="Token exchange"
        right={renderPill(tok.status, secondsLeft)}
      />

      {!code && (
        <Banner tone="warn" className="mt-5">
          <p>No authorization code yet — complete step 5 first.</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-[var(--playground-accent)]"
            onClick={() => setActiveStep("authorize")}
          >
            Go to Authorize →
          </Button>
        </Banner>
      )}

      {code && (
        <InfoCard label="Will POST to" url={tokenEndpoint ?? "—"} className="mt-5">
          <KVGrid className="mt-2">
            <KVRow label="grant_type">authorization_code</KVRow>
            <KVRow label="code">{shorten(code, 12, 8)}</KVRow>
            {state.authRequest.pkceEnabled && state.authRequest.codeVerifier && (
              <KVRow label="code_verifier">
                {shorten(state.authRequest.codeVerifier, 12, 8)}{" "}
                <span className="text-muted-foreground">(PKCE, RFC 7636 §4.5)</span>
              </KVRow>
            )}
            <KVRow label="redirect_uri">{state.client.redirectUri}</KVRow>
            <KVRow label="client auth">{state.client.authMethod}</KVRow>
          </KVGrid>
        </InfoCard>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {tok.status === "loading" ? (
          <Button disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
            Exchanging…
          </Button>
        ) : tok.status === "success" ? (
          <Button variant="secondary" onClick={onExchange} disabled={!canExchange}>
            <RotateCw className="h-4 w-4" />
            Re-exchange
          </Button>
        ) : (
          <Button onClick={onExchange} disabled={!canExchange}>
            <ArrowRight className="h-4 w-4" />
            Exchange code →
          </Button>
        )}
        {tok.status === "success" && tok.idToken && (
          <Button
            variant="ghost"
            onClick={() => openInInspector("id")}
            className="text-[var(--playground-accent)]"
          >
            <KeyRound className="h-4 w-4" />
            Inspect id_token
          </Button>
        )}
      </div>

      {tok.status === "success" && (
        <TokenPanel
          token={tok}
          onCopy={copy}
          copied={copied}
          onInspect={openInInspector}
          secondsLeft={secondsLeft}
        />
      )}

      {tok.status === "error" && (
        <ErrorPanel
          className="mt-4"
          message={tok.error ?? "Token exchange failed."}
          description={tok.errorDescription}
          status={tok.errorStatus}
          body={tok.errorBody}
        />
      )}
    </div>
  );
}

function TokenPanel({
  token,
  onCopy,
  copied,
  onInspect,
  secondsLeft,
}: {
  token: ReturnType<typeof usePlayground>["state"]["token"];
  onCopy: (kind: "access" | "id" | "refresh", value: string) => void;
  copied: "access" | "id" | "refresh" | null;
  onInspect: (source: "access" | "id" | "refresh") => void;
  secondsLeft: number | null;
}) {
  return (
    <div className="mt-4 space-y-3">
      {token.accessToken && (
        <TokenRow
          label="access_token"
          tag={
            looksLikeJwt(token.accessToken)
              ? "JWT"
              : `opaque · ${token.tokenType ?? "Bearer"}`
          }
          value={token.accessToken}
          copied={copied === "access"}
          onCopy={() => onCopy("access", token.accessToken!)}
          onInspect={() => onInspect("access")}
          inspectable={looksLikeJwt(token.accessToken)}
          subline={
            secondsLeft !== null
              ? secondsLeft > 0
                ? `expires in ${formatDuration(secondsLeft)}`
                : "expired"
              : undefined
          }
        />
      )}
      {token.idToken && (
        <TokenRow
          label="id_token"
          tag="JWT (OIDC)"
          value={token.idToken}
          copied={copied === "id"}
          onCopy={() => onCopy("id", token.idToken!)}
          onInspect={() => onInspect("id")}
          inspectable
        />
      )}
      {token.refreshToken && (
        <TokenRow
          label="refresh_token"
          tag={looksLikeJwt(token.refreshToken) ? "JWT" : "opaque"}
          value={token.refreshToken}
          copied={copied === "refresh"}
          onCopy={() => onCopy("refresh", token.refreshToken!)}
          onInspect={() => onInspect("refresh")}
          inspectable={looksLikeJwt(token.refreshToken)}
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
  copied,
  onCopy,
  onInspect,
  inspectable,
  subline,
}: {
  label: string;
  tag: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  onInspect: () => void;
  inspectable: boolean;
  subline?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card/40 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] font-medium">{label}</span>
        <span className="rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
          {tag}
        </span>
        {subline && (
          <span className="text-[11.5px] text-muted-foreground">· {subline}</span>
        )}
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onCopy}>
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
        {inspectable && (
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
  status: "idle" | "loading" | "success" | "error",
  secondsLeft: number | null,
) {
  if (status === "idle") return null;
  if (status === "loading")
    return (
      <StatusPill tone="muted" spinning>
        exchanging
      </StatusPill>
    );
  if (status === "success") {
    const expired = secondsLeft !== null && secondsLeft <= 0;
    const tone: StatusTone = expired ? "warn" : "success";
    const label = expired
      ? "token expired"
      : secondsLeft !== null
        ? `token · ${formatDuration(secondsLeft)} left`
        : "token received";
    return <StatusPill tone={tone}>{label}</StatusPill>;
  }
  return <StatusPill tone="error">failed</StatusPill>;
}
