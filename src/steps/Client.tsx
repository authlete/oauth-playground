import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Loader2,
} from "lucide-react";
import { usePlayground } from "../store/playground";
import { Button } from "../components/ui/Button";
import { Checkbox } from "../components/ui/Checkbox";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import {
  Disclosure,
  Section,
  StatusPill,
  StepHeader,
} from "../components/step";
import { cn } from "../protocol/cn";
import { shorten } from "../protocol/format";
import { validateClientConfig } from "../protocol/clientConfig";
import { buildClientMetadata, clientMetadataUrl } from "../protocol/cimd";
import { generateDpopKey } from "../protocol/dpop";
import {
  createConfidentialClient,
  MAKECLIENT_URL,
} from "../services/makeclient";
import { validateAndImportJwk } from "../protocol/jwk";
import { DcrRegisterStep } from "./DcrRegister";
import { FederationRegisterStep } from "./FederationRegister";
import {
  DEFAULT_CLIENT_CONFIG,
  type ClientAuthMethod,
  type DpopState,
} from "../types";

// Mask the sensitive JWK text when hidden (Chromium/WebKit -webkit-text-security).
const MASK_STYLE = { WebkitTextSecurity: "disc" } as CSSProperties;

const AUTH_METHODS: Array<{
  value: ClientAuthMethod;
  label: string;
  hint: string;
}> = [
  {
    value: "none",
    label: "none (public — PKCE only)",
    hint: "No client credential at /token. PKCE is required and is configured in Auth request.",
  },
  {
    value: "client_secret_basic",
    label: "client_secret_basic",
    hint: "Sends client_id:client_secret as HTTP Basic on /token. RFC 6749, Section 2.3.1.",
  },
  {
    value: "client_secret_post",
    label: "client_secret_post",
    hint: "Sends client_id and client_secret in the form body of /token.",
  },
  {
    value: "private_key_jwt",
    label: "private_key_jwt",
    hint: "Browser signs a client_assertion JWT with the JWK below. RFC 7523.",
  },
];

// A glanceable label for the active client_id. URLs (CIMD, Federation) show
// their last path segment or host — mid-truncating a URL (`http://loc…ata.json`)
// is unreadable; plain ids are short enough to shorten normally.
function clientIdLabel(id: string): string {
  try {
    const u = new URL(id);
    if (u.protocol === "http:" || u.protocol === "https:") {
      return u.pathname.split("/").filter(Boolean).pop() ?? u.host;
    }
  } catch {
    // not a URL — fall through
  }
  return shorten(id, 10, 8);
}

export function ClientStep() {
  const { state, clientUpdate, dpopUpdate, setActiveStep } = usePlayground();
  const cfg = state.client;
  const [jwkValidating, setJwkValidating] = useState(false);
  const [showKey, setShowKey] = useState(false);

  // CIMD lights up only when the AS advertises support. When it does, the
  // playground's own hosted metadata document becomes the recommended identity
  // and the manual/registration paths move to an advanced disclosure.
  const cimdSupported =
    state.discovery.metadata?.client_id_metadata_document_supported === true;
  const dcrSupported =
    typeof state.discovery.metadata?.registration_endpoint === "string";
  const federationSupported =
    typeof state.discovery.metadata?.federation_registration_endpoint ===
    "string";
  const metadataUrl = clientMetadataUrl(window.location.origin);
  const usingCimd = cfg.clientId === metadataUrl;
  const dcrClientId =
    state.dcrRegister.status === "success"
      ? state.dcrRegister.result?.clientId
      : undefined;
  const fedRegistered = state.federationRegister.status === "success";
  const dpopSupported = Array.isArray(
    state.discovery.metadata?.dpop_signing_alg_values_supported,
  );
  // Toggle DPoP; generate a key the first time it's turned on.
  const toggleDpop = async (enabled: boolean) => {
    if (enabled && !state.dpop.privateJwk) {
      const key = await generateDpopKey();
      dpopUpdate({
        enabled,
        privateJwk: key.privateJwk,
        publicJwk: key.publicJwk,
        thumbprint: key.thumbprint,
        alg: key.alg,
      });
    } else {
      dpopUpdate({ enabled });
    }
  };
  const regenerateDpopKey = async () => {
    const key = await generateDpopKey();
    dpopUpdate({
      privateJwk: key.privateJwk,
      publicJwk: key.publicJwk,
      thumbprint: key.thumbprint,
      alg: key.alg,
      nonce: undefined,
    });
  };
  const adoptCimdIdentity = () =>
    clientUpdate({
      clientId: metadataUrl,
      authMethod: "none",
      redirectUri: `${window.location.origin}/callback`,
    });

  // Confidential CIMD via makeclient: its minted key drops into private_key_jwt.
  const usingMakeclient = cfg.clientId.startsWith(`${MAKECLIENT_URL}/`);
  const cimdInUse = usingCimd || usingMakeclient;
  const [creatingCimd, setCreatingCimd] = useState(false);
  const [cimdError, setCimdError] = useState<string | undefined>();
  const createConfidentialCimd = async () => {
    setCreatingCimd(true);
    setCimdError(undefined);
    const redirectUri = `${window.location.origin}/callback`;
    try {
      const { clientId, privateJwk } =
        await createConfidentialClient(redirectUri);
      clientUpdate({
        clientId,
        authMethod: "private_key_jwt",
        redirectUri,
        privateKey: {
          jwkText: JSON.stringify(privateJwk, null, 2),
          status: "valid",
        },
      });
    } catch (err) {
      setCimdError(
        err instanceof Error ? err.message : "Could not reach makeclient.",
      );
    } finally {
      setCreatingCimd(false);
    }
  };

  // Auto-adopt CIMD when the server supports it and the client is still the
  // stock placeholder: the registration-free default the spec makes possible.
  // A real pasted client_id is left untouched.
  useEffect(() => {
    if (cimdSupported && cfg.clientId === DEFAULT_CLIENT_CONFIG.clientId) {
      adoptCimdIdentity();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cimdSupported]);

  // A signing key is needed for private_key_jwt client auth AND for JAR
  // (RFC 9101) request objects — a public/PKCE client can enable JAR too.
  const needsSigningKey =
    cfg.authMethod === "private_key_jwt" || state.authRequest.jarEnabled;

  // Debounced JWK validation: any change to the pasted text triggers a fresh
  // Web Crypto import. We hold the CryptoKey in memory only (§8).
  useEffect(() => {
    if (!needsSigningKey) return;
    const text = cfg.privateKey.jwkText;
    if (!text.trim()) {
      clientUpdate({ privateKey: { jwkText: text, status: "empty" } });
      return;
    }
    let cancelled = false;
    setJwkValidating(true);
    const handle = window.setTimeout(async () => {
      const result = await validateAndImportJwk(text);
      if (cancelled) return;
      setJwkValidating(false);
      if (result.ok) {
        clientUpdate({
          privateKey: {
            jwkText: text,
            status: "valid",
            alg: result.alg,
            kid: result.kid,
            errorMessage: undefined,
          },
        });
      } else {
        clientUpdate({
          privateKey: {
            jwkText: text,
            status: "invalid",
            alg: undefined,
            kid: undefined,
            errorMessage: result.message,
          },
        });
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [needsSigningKey, cfg.privateKey.jwkText, clientUpdate]);

  const validation = useMemo(() => validateClientConfig(cfg), [cfg]);

  return (
    <div className="mx-auto max-w-3xl @4xl:max-w-5xl">
      <StepHeader
        step="client"
        right={
          validation.ok ? (
            <StatusPill tone="success">ready</StatusPill>
          ) : (
            <StatusPill tone="muted" icon={Loader2}>
              configuring
            </StatusPill>
          )
        }
      />

      <div className="mt-6 space-y-4">
        {cimdSupported && (
          <CimdHero
            metadataUrl={metadataUrl}
            activeClientId={cimdInUse ? cfg.clientId : metadataUrl}
            inUse={cimdInUse}
            confidential={usingMakeclient}
            creating={creatingCimd}
            error={cimdError}
            onUse={adoptCimdIdentity}
            onCreateConfidential={createConfidentialCimd}
            onContinue={() => setActiveStep("auth-request")}
          />
        )}

        <ClassicConfig
          fold={cimdSupported}
          activeId={cimdInUse ? undefined : cfg.clientId}
        >
          <Section
            title="Identity"
            description="Who this client is, and where the AS sends the authorization response."
            summaryRight={
              cfg.clientId ? clientIdLabel(cfg.clientId) : undefined
            }
          >
            <div className="space-y-5">
              <Field
                label="Client ID"
                hint="Accepts a plain ID or a URL. ASes that support OpenID Federation or Client ID Metadata Document will resolve a URL automatically."
              >
                <Input
                  mono
                  value={cfg.clientId}
                  onChange={(e) => clientUpdate({ clientId: e.target.value })}
                  placeholder="2234376661"
                  autoComplete="off"
                  spellCheck={false}
                />
                {looksUrlShaped(cfg.clientId) && (
                  <span className="mt-1 inline-block rounded-sm bg-[color-mix(in_oklch,var(--playground-accent)_12%,transparent)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--playground-accent)]">
                    URL identifier
                  </span>
                )}
              </Field>

              <Field
                label="Redirect URI"
                hint={
                  "Pre-filled to this playground's /callback; override only if your AS expects a different one."
                }
              >
                <Input
                  mono
                  value={cfg.redirectUri}
                  onChange={(e) =>
                    clientUpdate({ redirectUri: e.target.value })
                  }
                  placeholder="http://localhost:5173/callback"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
            </div>
          </Section>

          <Disclosure
            title="Authentication"
            description="How the client proves itself to the authorization server."
            summaryRight={cfg.authMethod}
            // Collapsed for the common public/PKCE client (nothing to enter);
            // opened when a credential method needs a secret or key.
            defaultOpen={cfg.authMethod !== "none"}
          >
            <div className="space-y-5">
              <Field
                label="Method"
                hint={
                  AUTH_METHODS.find((m) => m.value === cfg.authMethod)?.hint
                }
              >
                <Select
                  value={cfg.authMethod}
                  onChange={(e) =>
                    clientUpdate({
                      authMethod: e.target.value as ClientAuthMethod,
                    })
                  }
                >
                  {AUTH_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </Field>

              {(cfg.authMethod === "client_secret_basic" ||
                cfg.authMethod === "client_secret_post") && (
                <Field
                  label="Client secret"
                  hint="Held in memory for this session only — never persisted, never shared via URL."
                >
                  <Input
                    type="password"
                    mono
                    value={cfg.clientSecret}
                    onChange={(e) =>
                      clientUpdate({ clientSecret: e.target.value })
                    }
                    placeholder="paste secret"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
              )}

              {needsSigningKey && (
                <Field
                  label="Private key (JWK)"
                  hint={
                    cfg.authMethod === "private_key_jwt"
                      ? "Signs the client_assertion (private_key_jwt) and, if JAR is on, the request object. Paste a JWK with a private exponent (`d`); never persisted."
                      : "Signs the JAR request object (RFC 9101). Paste a JWK with a private exponent (`d`); never persisted."
                  }
                  action={
                    cfg.privateKey.jwkText.trim() ? (
                      <button
                        type="button"
                        onClick={() => setShowKey((v) => !v)}
                        className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
                      >
                        {showKey ? (
                          <>
                            <EyeOff className="h-3.5 w-3.5" /> Hide
                          </>
                        ) : (
                          <>
                            <Eye className="h-3.5 w-3.5" /> Show
                          </>
                        )}
                      </button>
                    ) : undefined
                  }
                >
                  <Textarea
                    mono
                    rows={10}
                    value={cfg.privateKey.jwkText}
                    onChange={(e) =>
                      clientUpdate({
                        privateKey: {
                          ...cfg.privateKey,
                          jwkText: e.target.value,
                        },
                      })
                    }
                    placeholder={
                      '{\n  "kty": "EC",\n  "crv": "P-256",\n  "kid": "...",\n  "x": "...",\n  "y": "...",\n  "d": "..."\n}'
                    }
                    className="min-h-[200px] resize-y"
                    style={showKey ? undefined : MASK_STYLE}
                  />
                  <JwkStatusLine
                    validating={jwkValidating}
                    status={cfg.privateKey.status}
                    alg={cfg.privateKey.alg}
                    kid={cfg.privateKey.kid}
                    errorMessage={cfg.privateKey.errorMessage}
                  />
                </Field>
              )}
            </div>
          </Disclosure>

          {!validation.ok && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-[12.5px] text-muted-foreground">
              {validation.message}
            </div>
          )}

          {/* Registration methods — only when the AS advertises them. Collapsed
              by default: they're alternatives you opt into, not the main path. */}
          {dcrSupported && (
            <Disclosure
              title="Dynamic Client Registration"
              hint="RFC 7591"
              summaryRight={
                dcrClientId ? shorten(dcrClientId, 8, 6) : undefined
              }
            >
              <DcrRegisterStep embedded />
            </Disclosure>
          )}
          {federationSupported && (
            <Disclosure
              title="OpenID Federation"
              hint="OpenID Federation 1.0"
              summaryRight={fedRegistered ? "registered" : undefined}
            >
              <FederationRegisterStep embedded />
            </Disclosure>
          )}
        </ClassicConfig>

        {dpopSupported && (
          <DpopSection
            dpop={state.dpop}
            onToggle={toggleDpop}
            onRegenerate={regenerateDpopKey}
          />
        )}
      </div>
    </div>
  );
}

// DPoP (RFC 9449): a client-level token-binding mechanism — orthogonal to who
// the client is, so it sits beside identity rather than inside it.
function DpopSection({
  dpop,
  onToggle,
  onRegenerate,
}: {
  dpop: DpopState;
  onToggle: (enabled: boolean) => void;
  onRegenerate: () => void;
}) {
  return (
    <Disclosure
      title="Sender-constrained tokens (DPoP)"
      hint="RFC 9449"
      description="Bind the token to a key the client holds. Each request carries a fresh proof; the token's cnf.jkt matches the key below."
      summaryRight={dpop.enabled ? `on · ${dpop.alg}` : "off"}
      defaultOpen={dpop.enabled}
    >
      <div className="space-y-4">
        <Checkbox
          label="Request DPoP-bound tokens and send a proof on every request"
          checked={dpop.enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        {dpop.enabled && dpop.thumbprint && (
          <div className="rounded-md border border-border bg-background/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
                  key thumbprint (cnf.jkt) · {dpop.alg}
                </div>
                <code className="mt-0.5 block break-all font-mono text-[12px]">
                  {dpop.thumbprint}
                </code>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRegenerate}
                className="shrink-0"
              >
                Regenerate
              </Button>
            </div>
          </div>
        )}
      </div>
    </Disclosure>
  );
}

// The classic client-config paths (manual id, secrets, private_key_jwt — DCR
// and Federation live under this step too). First-class when the AS has no
// CIMD; demoted to a collapsed "advanced" disclosure when CIMD is the lead.
function ClassicConfig({
  fold,
  activeId,
  children,
}: {
  fold: boolean;
  /** The manual client_id currently in use, when CIMD is not — shown in the
   * collapsed summary so the active identity is never hidden. */
  activeId?: string;
  children: ReactNode;
}) {
  if (!fold) return <div className="space-y-4">{children}</div>;
  return (
    <Disclosure
      title="Other ways to identify the client"
      description="A manual client_id, a client secret, private_key_jwt, Dynamic Client Registration, or OpenID Federation."
      // When a non-CIMD identity is active it lives in here; the collapsed
      // summary carries its id + an "in use" tag so the active choice is never
      // ambiguous — no need to force the section open.
      summaryRight={
        activeId ? (
          <span className="flex items-center gap-2">
            {clientIdLabel(activeId)}
            <StatusPill tone="success">in use</StatusPill>
          </span>
        ) : undefined
      }
    >
      <div className="space-y-4">{children}</div>
    </Disclosure>
  );
}

// The hero: when the AS advertises CIMD, this is the recommended, zero-config
// way to identify the client. The playground hosts its own metadata document
// and the client_id is simply that URL.
function CimdHero({
  metadataUrl,
  activeClientId,
  inUse,
  confidential,
  creating,
  error,
  onUse,
  onCreateConfidential,
  onContinue,
}: {
  metadataUrl: string;
  /** The client_id currently shown — the self-hosted URL, or a makeclient URL. */
  activeClientId: string;
  inUse: boolean;
  /** Active identity is a makeclient-hosted private_key_jwt client. */
  confidential: boolean;
  creating: boolean;
  error?: string;
  onUse: () => void;
  onCreateConfidential: () => void;
  onContinue: () => void;
}) {
  const doc = useMemo(
    () => buildClientMetadata(new URL(metadataUrl).origin),
    [metadataUrl],
  );
  return (
    <section className="rounded-lg border border-[var(--playground-accent)]/40 bg-[color-mix(in_oklch,var(--playground-accent)_7%,transparent)] p-4 @4xl:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Fingerprint className="mt-0.5 h-5 w-5 shrink-0 text-[var(--playground-accent)]" />
          <div>
            <h2 className="text-[13px] font-semibold leading-5">
              Client ID Metadata Document
            </h2>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              Identify the client by a URL that serves its metadata — public
              (self-hosted) or confidential with a key.
            </p>
          </div>
        </div>
        {inUse ? (
          <StatusPill tone="success" className="shrink-0 whitespace-nowrap">
            in use
          </StatusPill>
        ) : (
          <StatusPill tone="muted" icon={Check} className="shrink-0">
            supported
          </StatusPill>
        )}
      </div>

      <div className="mt-3 rounded-md border border-border bg-background/60 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
            client_id
          </span>
          {confidential && (
            <span className="font-mono text-[10.5px] text-[var(--playground-accent)]">
              private_key_jwt
            </span>
          )}
        </div>
        <code className="mt-0.5 block break-all font-mono text-[12px]">
          {activeClientId}
        </code>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!inUse && (
          <Button onClick={onUse}>
            <Fingerprint className="h-4 w-4" />
            Use this identity
          </Button>
        )}
        {!confidential && (
          <Button
            variant="secondary"
            onClick={onCreateConfidential}
            disabled={creating}
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            {creating ? "Creating…" : "Create with a key"}
          </Button>
        )}
        {inUse && (
          <Button size="sm" onClick={onContinue} className="ml-auto">
            Continue to Auth request
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {!confidential && (
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          Hosted on{" "}
          <span className="font-mono">{new URL(MAKECLIENT_URL).host}</span> —
          reachable by your AS.
        </p>
      )}
      {error && (
        <p className="mt-2 text-[11.5px] text-[var(--status-error)]">{error}</p>
      )}

      {confidential ? (
        <a
          href={activeClientId}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-[12px] text-[var(--playground-accent)]"
        >
          Open hosted document ↗
        </a>
      ) : (
        <Disclosure
          title="View the document"
          description="The JSON the server fetches from the client_id URL."
        >
          <pre className="overflow-x-auto rounded-md border border-border bg-background/60 p-3 font-mono text-[11.5px] leading-relaxed">
            {JSON.stringify(doc, null, 2)}
          </pre>
        </Disclosure>
      )}
    </section>
  );
}

function Field({
  label,
  hint,
  action,
  children,
}: {
  label: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="block text-[12.5px] font-medium">{label}</label>
        {action}
      </div>
      {children}
      {hint && (
        <p className="mt-1.5 text-[12px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function looksUrlShaped(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function JwkStatusLine({
  validating,
  status,
  alg,
  kid,
  errorMessage,
}: {
  validating: boolean;
  status: "empty" | "valid" | "invalid";
  alg?: string;
  kid?: string;
  errorMessage?: string;
}) {
  if (status === "empty") return null;
  if (validating) {
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Validating JWK…
      </p>
    );
  }
  if (status === "valid") {
    return (
      <p
        className={cn(
          "mt-2 inline-flex items-center gap-1.5 text-[12.5px]",
          "text-[var(--status-success)]",
        )}
      >
        <KeyRound className="h-3.5 w-3.5" />
        <span className="font-mono">
          alg: <span className="font-semibold">{alg}</span>
          {kid ? (
            <>
              {" · kid: "}
              <span className="font-semibold">{kid}</span>
            </>
          ) : null}
        </span>
        <Check className="h-3.5 w-3.5" />
      </p>
    );
  }
  return (
    <p
      className={cn(
        "mt-2 inline-flex items-start gap-1.5 text-[12.5px]",
        "text-[var(--status-error)]",
      )}
    >
      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{errorMessage}</span>
    </p>
  );
}
