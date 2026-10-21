import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, KeyRound, Loader2, RefreshCw, Send } from "lucide-react";
import { usePlayground } from "../store/playground";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Checkbox } from "../components/ui/Checkbox";
import { Textarea } from "../components/ui/Textarea";
import {
  Banner,
  Choice,
  Disclosure,
  ErrorPanel,
  InfoCard,
  JwtPanel,
  KVGrid,
  KVRow,
  RequestPreview,
  Section,
  StatusPill,
  StepHeader,
} from "../components/step";
import { looksLikeJwt, parseJwt } from "../protocol/jwt";
import { shorten } from "../protocol/format";
import { randomBase64Url } from "../protocol/random";
import { validateClientConfig } from "../protocol/clientConfig";
import { previewJwtBearer } from "../protocol/requestPreview";
import {
  buildGrantAssertion,
  requestJwtBearerToken,
  signingJwkText,
} from "../protocol/jwtBearerGrant";
import { tokenStatePatchFromResult } from "../protocol/tokenExchange";
import { dpopContextFrom } from "../protocol/dpop";

export function JwtBearerStep() {
  const {
    state,
    jwtBearerUpdate,
    tokenUpdate,
    inspectorUpdate,
    setActiveStep,
    networkAdd,
    networkUpdate,
    dpopUpdate,
  } = usePlayground();
  const jwtBearer = state.jwtBearer;
  const metadata = state.discovery.metadata;
  const tokenEndpoint = metadata?.token_endpoint;
  const asIssuer = metadata?.issuer ?? "";
  const client = state.client;
  const external = jwtBearer.issuerMode === "external";

  const hasSubject = jwtBearer.subject.trim().length > 0;
  const keyText = signingJwkText(client, jwtBearer);
  const hasKey = keyText.trim().length > 0;
  const issuerReady = external
    ? jwtBearer.externalIssuer.trim().length > 0
    : true;
  const audSourceReady =
    jwtBearer.audMode === "token" ? !!tokenEndpoint : !!asIssuer;
  const aud = jwtBearer.audMode === "issuer" ? asIssuer : (tokenEndpoint ?? "");

  // Seed an opaque subject once so the step is ready without a forced click.
  useEffect(() => {
    if (!jwtBearer.subject) jwtBearerUpdate({ subject: randomBase64Url(16) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-sign the assertion so the real JWT shows in the request + decoder,
  // refreshed on every input change (re-signed again at send time). Local state.
  const [assertionJwt, setAssertionJwt] = useState<string | null>(null);
  const [assertionError, setAssertionError] = useState<string | null>(null);
  const canSign = hasKey && hasSubject && issuerReady && audSourceReady;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!canSign || !tokenEndpoint) {
        if (!cancelled) {
          setAssertionJwt(null);
          setAssertionError(null);
        }
        return;
      }
      const res = await buildGrantAssertion({
        client,
        asIssuer,
        tokenEndpoint,
        jwtBearer,
      });
      if (cancelled) return;
      setAssertionJwt(res.ok ? res.jwt : null);
      setAssertionError(res.ok ? null : res.message);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canSign,
    asIssuer,
    tokenEndpoint,
    client.clientId,
    keyText,
    jwtBearer.issuerMode,
    jwtBearer.externalIssuer,
    jwtBearer.subject,
    jwtBearer.audMode,
    jwtBearer.lifetimeSecs,
    jwtBearer.includeNbf,
    jwtBearer.includeJti,
  ]);

  const clientValid = validateClientConfig(client).ok;
  // A produced assertion means the key imported and the claims resolved — the
  // cleanest readiness signal, and it covers the external-issuer path too.
  const canRequest =
    !!tokenEndpoint &&
    clientValid &&
    !!assertionJwt &&
    jwtBearer.status !== "loading";

  const onRequest = async () => {
    if (!metadata || !tokenEndpoint || !canRequest) return;
    jwtBearerUpdate({
      status: "loading",
      errorMessage: undefined,
      errorStatus: undefined,
      errorBody: undefined,
    });
    tokenUpdate({
      status: "loading",
      error: undefined,
      errorDescription: undefined,
      errorBody: undefined,
      errorStatus: undefined,
    });
    const result = await requestJwtBearerToken({
      metadata,
      client,
      authRequest: state.authRequest,
      jwtBearer,
      dpop: dpopContextFrom(state.dpop),
      onDpopNonce: (nonce) => dpopUpdate({ nonce }),
      onStart: networkAdd,
      onFinish: networkUpdate,
    });
    tokenUpdate(tokenStatePatchFromResult(result, Date.now()));
    if (result.ok) {
      jwtBearerUpdate({ status: "success", exchangedAt: Date.now() });
    } else {
      jwtBearerUpdate({
        status: "error",
        errorMessage: result.errorDescription ?? result.message ?? result.error,
        errorStatus: result.status,
        errorBody: result.body,
      });
    }
  };

  const parsed = assertionJwt ? parseJwt(assertionJwt) : null;
  const tok = state.token;

  return (
    <div className="mx-auto max-w-3xl @4xl:max-w-5xl">
      <StepHeader step="jwt-bearer" right={renderPill(jwtBearer.status)} />

      {!tokenEndpoint && (
        <Banner tone="error" className="mt-4">
          No <code className="font-mono">token_endpoint</code> in discovery —
          run Discovery first.
        </Banner>
      )}

      {tokenEndpoint && (
        <>
          <Section title="Assertion" className="mt-4">
            <div className="space-y-4">
              <Field label="sub" hint="the user the client acts for">
                <div className="flex gap-2">
                  <Input
                    mono
                    placeholder="opaque user id"
                    value={jwtBearer.subject}
                    onChange={(e) =>
                      jwtBearerUpdate({ subject: e.target.value })
                    }
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    onClick={() =>
                      jwtBearerUpdate({ subject: randomBase64Url(16) })
                    }
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Generate
                  </Button>
                </div>
              </Field>

              <Field label="iss" hint="who issues the assertion">
                <Choice
                  value={jwtBearer.issuerMode}
                  options={[
                    { id: "client", label: "The client" },
                    { id: "external", label: "Another trusted issuer" },
                  ]}
                  onChange={(issuerMode) => jwtBearerUpdate({ issuerMode })}
                />
                {external ? (
                  <div className="mt-2 space-y-2">
                    <Input
                      mono
                      placeholder="https://issuer.example"
                      value={jwtBearer.externalIssuer}
                      onChange={(e) =>
                        jwtBearerUpdate({ externalIssuer: e.target.value })
                      }
                    />
                    <Textarea
                      mono
                      rows={5}
                      className="text-[11.5px]"
                      placeholder={
                        '{\n  "kty": "EC",\n  "crv": "P-256",\n  "d": "…",\n  "x": "…",\n  "y": "…"\n}'
                      }
                      value={jwtBearer.externalJwk}
                      onChange={(e) =>
                        jwtBearerUpdate({ externalJwk: e.target.value })
                      }
                    />
                    <p className="text-[11px] text-muted-foreground">
                      The issuer's private JWK — the AS must trust its public
                      key.
                    </p>
                  </div>
                ) : (
                  <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[11.5px] text-muted-foreground">
                    <KeyRound className="h-3.5 w-3.5" />
                    {client.clientId}
                    {!hasKey && (
                      <button
                        type="button"
                        onClick={() => setActiveStep("client")}
                        className="ml-1 font-sans text-[var(--playground-accent)] hover:underline"
                      >
                        set a signing key →
                      </button>
                    )}
                  </p>
                )}
              </Field>
            </div>
          </Section>

          <Disclosure title="Advanced" className="mt-3">
            <div className="space-y-4">
              <Field label="aud" hint="who the assertion is for">
                <div className="flex flex-wrap items-center gap-3">
                  <Choice
                    value={jwtBearer.audMode}
                    options={[
                      { id: "issuer", label: "issuer" },
                      { id: "token", label: "token endpoint" },
                    ]}
                    onChange={(audMode) => jwtBearerUpdate({ audMode })}
                  />
                  <code className="break-all font-mono text-[11px] text-muted-foreground">
                    {aud || "—"}
                  </code>
                </div>
              </Field>
              <Field label="exp" hint="lifetime from now">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    className="w-24"
                    value={jwtBearer.lifetimeSecs}
                    onChange={(e) =>
                      jwtBearerUpdate({
                        lifetimeSecs: Math.max(1, Number(e.target.value) || 0),
                      })
                    }
                  />
                  <span className="text-[12px] text-muted-foreground">
                    seconds
                  </span>
                  <span className="mx-1 text-border">·</span>
                  <Checkbox
                    label="nbf"
                    checked={jwtBearer.includeNbf}
                    onChange={(e) =>
                      jwtBearerUpdate({ includeNbf: e.target.checked })
                    }
                  />
                  <Checkbox
                    label="jti"
                    checked={jwtBearer.includeJti}
                    onChange={(e) =>
                      jwtBearerUpdate({ includeJti: e.target.checked })
                    }
                  />
                </div>
              </Field>
            </div>
          </Disclosure>

          {parsed?.ok && (
            <Section
              title="assertion"
              hint="decoded"
              description="Decoded. This JWT rides in the request below as the assertion parameter — not the client_assertion (client auth)."
              className="mt-4"
            >
              <JwtPanel jwt={parsed.jwt} payloadSubtitle="RFC 7523 grant" />
            </Section>
          )}

          {assertionError && (
            <Banner tone="error" className="mt-3">
              {assertionError}
            </Banner>
          )}

          <RequestPreview
            className="mt-3"
            block={previewJwtBearer(
              tokenEndpoint,
              client,
              state.authRequest,
              assertionJwt,
              state.dpop.enabled,
            )}
          />

          <div className="mt-5 flex flex-wrap gap-2">
            {jwtBearer.status === "loading" ? (
              <Button disabled>
                <Loader2 className="h-4 w-4 animate-spin" />
                Requesting…
              </Button>
            ) : (
              <Button onClick={onRequest} disabled={!canRequest}>
                <Send className="h-4 w-4" />
                {jwtBearer.status === "success"
                  ? "Request again"
                  : "Request token"}
              </Button>
            )}
            {jwtBearer.status === "success" && (
              <Button
                variant="ghost"
                onClick={() => setActiveStep("resource")}
                className="text-[var(--playground-accent)]"
              >
                <ArrowRight className="h-4 w-4" />
                Use the token
              </Button>
            )}
          </div>

          {jwtBearer.status === "success" && tok.accessToken && (
            <InfoCard label="Token issued" className="mt-4">
              <KVGrid>
                <KVRow label="access_token">
                  {shorten(tok.accessToken, 16, 10)}{" "}
                  <span className="text-muted-foreground">
                    ({looksLikeJwt(tok.accessToken) ? "JWT" : "opaque"})
                  </span>
                </KVRow>
                <KVRow label="token_type">{tok.tokenType ?? "Bearer"}</KVRow>
                {typeof tok.expiresIn === "number" && (
                  <KVRow label="expires_in">{tok.expiresIn}s</KVRow>
                )}
                {tok.scope && <KVRow label="scope">{tok.scope}</KVRow>}
              </KVGrid>
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 text-[var(--playground-accent)]"
                onClick={() => {
                  inspectorUpdate({
                    source: looksLikeJwt(tok.accessToken!) ? "access" : "id",
                  });
                  setActiveStep("inspect");
                }}
              >
                Inspect →
              </Button>
            </InfoCard>
          )}

          {jwtBearer.status === "error" && (
            <ErrorPanel
              className="mt-4"
              message={jwtBearer.errorMessage ?? "JWT Bearer grant failed."}
              status={jwtBearer.errorStatus}
              body={jwtBearer.errorBody}
            />
          )}
        </>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <span className="font-mono text-[12px] font-medium">{label}</span>
        {hint && (
          <span className="text-[11px] text-muted-foreground">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function renderPill(
  status: ReturnType<typeof usePlayground>["state"]["jwtBearer"]["status"],
) {
  if (status === "idle") return null;
  if (status === "loading")
    return (
      <StatusPill tone="muted" spinning>
        requesting
      </StatusPill>
    );
  if (status === "success")
    return <StatusPill tone="success">token issued</StatusPill>;
  return <StatusPill tone="error">failed</StatusPill>;
}
