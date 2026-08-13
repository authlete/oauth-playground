import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Loader2, RotateCw } from "lucide-react";
import { LivePreview } from "./parts/LivePreview";
import { usePlayground } from "../store/playground";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Checkbox } from "../components/ui/Checkbox";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import {
  AuthorizationDetailChips,
  JwtPanel,
  Section,
  StatusPill,
  StepHeader,
} from "../components/step";
import {
  AUTHORIZATION_DETAILS_TEMPLATES,
  parseAuthorizationDetails,
} from "../lib/authorizationDetails";
import { computeCodeChallenge, generateCodeVerifier } from "../lib/pkce";
import { randomBase64Url } from "../lib/random";
import { buildAuthorizeUrl } from "../lib/authorizeUrl";
import { cn } from "../lib/cn";
import { jarReadiness } from "../lib/requestObject";
import { parseJwt } from "../lib/jwt";
import {
  COMMON_SCOPES,
  GRANT_MANAGEMENT_ACTIONS,
  type AuthRequestState,
  type ResponseMode,
} from "../types";

const GRANT_MANAGEMENT_SCOPES = [
  "grant_management_query",
  "grant_management_revoke",
] as const;

const RESPONSE_TYPES = ["code", "id_token", "code id_token", "token"];

const RESPONSE_MODES: Array<{ value: ResponseMode; label: string }> = [
  { value: "query", label: "query (default for code)" },
  { value: "fragment", label: "fragment" },
  { value: "form_post", label: "form_post" },
];

export function AuthRequestStep() {
  const { state, authRequestUpdate, parUpdate, resourceUpdate, setActiveStep } =
    usePlayground();
  const req = state.authRequest;
  const metadata = state.discovery.metadata;
  const client = state.client;
  const parEnabled = state.par.enabled;
  const parSupported = !!metadata?.pushed_authorization_request_endpoint;
  const [pkceRegenerating, setPkceRegenerating] = useState(false);
  const [copied, setCopied] = useState<"url" | "curl" | null>(null);

  const parRequestUri =
    state.par.status === "success" && state.par.requestUri
      ? state.par.requestUri
      : undefined;
  const builtUrl = useMemo(
    () => buildAuthorizeUrl(metadata, client, req, parRequestUri),
    [metadata, client, req, parRequestUri],
  );

  const jarReady = jarReadiness(client, req);
  const isValid = builtUrl.ok && req.scopes.length > 0 && jarReady.ok;

  // When the flow started at a protected resource, offer its advertised
  // scopes (RFC 9728 scopes_supported) alongside the OIDC standard set.
  const prmScopes =
    state.resource.status === "success"
      ? (state.resource.prm?.scopes_supported ?? [])
      : [];
  const availableScopes = [
    ...COMMON_SCOPES,
    ...prmScopes.filter(
      (s) => !(COMMON_SCOPES as readonly string[]).includes(s),
    ),
  ];

  // RAR types the AS advertises, offered as a hint next to the editor (never a
  // hard gate — an AS may accept types it doesn't advertise).
  const adTypes = metadata?.authorization_details_types_supported ?? [];

  // Grant management: the actions the AS accepts, filtered to the ones sent as
  // the request parameter (create/update/replace/merge — query/revoke are API
  // calls). The section only renders when the AS supports at least one.
  const gmActions = GRANT_MANAGEMENT_ACTIONS.filter((a) =>
    metadata?.grant_management_actions_supported?.includes(a),
  );
  const gmRequired = metadata?.grant_management_action_required === true;

  const regenState = () => authRequestUpdate({ state: randomBase64Url(16) });
  const regenNonce = () => authRequestUpdate({ nonce: randomBase64Url(16) });
  const regenPkce = async () => {
    setPkceRegenerating(true);
    const v = generateCodeVerifier();
    const c = await computeCodeChallenge(v);
    authRequestUpdate({ codeVerifier: v, codeChallenge: c });
    setPkceRegenerating(false);
  };

  const toggleScope = useCallback(
    (scope: string) => {
      const has = req.scopes.includes(scope);
      authRequestUpdate({
        scopes: has
          ? req.scopes.filter((s) => s !== scope)
          : [...req.scopes, scope],
      });
    },
    [req.scopes, authRequestUpdate],
  );

  const addCustomScope = () => {
    const value = req.customScope.trim();
    if (!value) return;
    const tokens = value.split(/\s+/).filter(Boolean);
    const next = [...req.scopes];
    for (const t of tokens) if (!next.includes(t)) next.push(t);
    authRequestUpdate({ scopes: next, customScope: "" });
  };

  const onCopy = async (kind: "url" | "curl") => {
    if (!builtUrl.ok) return;
    const value =
      kind === "url"
        ? builtUrl.url
        : `curl -i -L '${builtUrl.url.replace(/'/g, "'\\''")}'`;
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

  return (
    <div className="mx-auto max-w-3xl @4xl:max-w-5xl">
      <Header valid={isValid} />

      {!metadata && (
        <div className="mt-5 rounded-md border border-[var(--status-warn)]/40 bg-[color-mix(in_oklch,var(--status-warn)_8%,transparent)] p-3 text-[13px]">
          <p>
            Run Discovery first — this step needs{" "}
            <code className="font-mono">authorization_endpoint</code> from the
            AS.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-[var(--playground-accent)]"
            onClick={() => setActiveStep("discovery")}
          >
            Go to Discovery →
          </Button>
        </div>
      )}

      <div className="mt-6 space-y-4">
        <Section
          title="Request parameters"
          description="What to ask the AS for, and how it should return the response."
        >
          <div className="space-y-5">
            <Field label="Scopes">
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {availableScopes.map((s) => (
                  <Checkbox
                    key={s}
                    label={s}
                    checked={req.scopes.includes(s)}
                    onChange={() => toggleScope(s)}
                  />
                ))}
              </div>
              {req.scopes.some((s) => !availableScopes.includes(s)) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {req.scopes
                    .filter((s) => !availableScopes.includes(s))
                    .map((s) => (
                      <button
                        type="button"
                        key={s}
                        onClick={() => toggleScope(s)}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 font-mono text-[11px] hover:bg-muted"
                        title="Click to remove"
                      >
                        {s} ✕
                      </button>
                    ))}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <Input
                  mono
                  value={req.customScope}
                  onChange={(e) =>
                    authRequestUpdate({ customScope: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomScope();
                    }
                  }}
                  placeholder="add custom scope, e.g. read:repo"
                  className="h-8"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={addCustomScope}
                  disabled={!req.customScope.trim()}
                >
                  Add
                </Button>
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="response_type"
                hint="What the AS returns at the callback."
              >
                <Select
                  value={req.responseType}
                  onChange={(e) =>
                    authRequestUpdate({ responseType: e.target.value })
                  }
                >
                  {RESPONSE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="response_mode"
                hint="How the AS delivers the response to the redirect URI."
              >
                <Select
                  value={req.responseMode}
                  onChange={(e) =>
                    authRequestUpdate({
                      responseMode: e.target.value as ResponseMode,
                    })
                  }
                >
                  {RESPONSE_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {state.resource.status === "success" && state.resource.prm && (
              <div>
                <Checkbox
                  label="resource indicator (RFC 8707)"
                  checked={state.resource.indicatorEnabled}
                  onChange={(e) =>
                    resourceUpdate({ indicatorEnabled: e.target.checked })
                  }
                />
                <p className="mt-1 pl-6 font-mono text-[11.5px] text-muted-foreground">
                  resource={state.resource.prm.resource}
                </p>
                <p className="mt-1 pl-6 text-[12px] text-muted-foreground">
                  Audience-restricts the token to the protected resource
                  discovered in step 1; sent on the authorize and token
                  requests.
                </p>
              </div>
            )}
          </div>
        </Section>

        <AuthorizationDetailsSection
          req={req}
          update={authRequestUpdate}
          supportedTypes={adTypes}
        />

        {gmActions.length > 0 && (
          <GrantManagementSection
            req={req}
            update={authRequestUpdate}
            actions={gmActions}
            required={gmRequired}
            onToggleScope={toggleScope}
          />
        )}

        <Section
          title="Extensions"
          description={
            parSupported
              ? "PKCE is on by default — leave it on unless the AS can't handle it. PAR adds a step that pushes the request to the AS first."
              : "PKCE is on by default — leave it on unless the AS can't handle it. PAR is unavailable: this AS doesn't advertise a PAR endpoint."
          }
        >
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Checkbox
              label="PKCE (S256, RFC 7636)"
              checked={req.pkceEnabled}
              onChange={(e) =>
                authRequestUpdate({ pkceEnabled: e.target.checked })
              }
            />
            <Checkbox
              label="PAR (RFC 9126)"
              checked={parEnabled}
              disabled={!parSupported}
              onChange={(e) => parUpdate({ enabled: e.target.checked })}
            />
            <Checkbox
              label="JAR (RFC 9101 — signed request object)"
              checked={req.jarEnabled}
              onChange={(e) =>
                authRequestUpdate({ jarEnabled: e.target.checked })
              }
            />
          </div>
          {req.jarEnabled && !jarReady.ok && (
            <p className="mt-2 text-[11.5px] text-[var(--status-warn)]">
              {jarReady.message}{" "}
              <button
                type="button"
                onClick={() => setActiveStep("client")}
                className="underline hover:text-foreground"
              >
                Go to Client config →
              </button>
            </p>
          )}
        </Section>

        <Section
          title="Security parameters"
          description="Generated fresh for each run — regenerate any value manually with ↻."
        >
          <div className="space-y-4">
            <ParamRow
              label="state"
              value={req.state}
              onRegen={regenState}
              hint="Anti-CSRF. Echoed back at the callback and compared."
            />
            <ParamRow
              label="nonce"
              value={req.nonce}
              onRegen={regenNonce}
              hint="Bound into the ID token; mitigates replay."
            />
            {req.pkceEnabled && (
              <ParamRow
                label="code_verifier"
                value={req.codeVerifier}
                onRegen={regenPkce}
                regenerating={pkceRegenerating}
                hint="Held in memory; sent to /token at Token exchange. Challenge = SHA-256(verifier)."
                secondary={
                  req.codeChallenge ? (
                    <span className="font-mono text-[11.5px] text-muted-foreground">
                      code_challenge · {req.codeChallenge}{" "}
                      <span className="text-foreground">(S256)</span>
                    </span>
                  ) : (
                    <span className="text-[11.5px] text-muted-foreground">
                      computing…
                    </span>
                  )
                }
              />
            )}
          </div>
        </Section>

        <AdvancedExpander req={req} update={authRequestUpdate} />

        <LivePreview
          built={builtUrl}
          metadata={metadata}
          client={client}
          authRequest={req}
          parEnabled={parEnabled}
          parPushed={!!parRequestUri}
          copied={copied}
          onCopy={onCopy}
          onContinue={() => setActiveStep(parEnabled ? "par" : "authorize")}
        />

        {req.jarEnabled && jarReady.ok && (
          <RequestObjectPanel req={req} issuer={metadata?.issuer} />
        )}
      </div>
    </div>
  );
}

function Header({ valid }: { valid: boolean }) {
  return (
    <StepHeader
      step="auth-request"
      right={
        valid ? (
          <StatusPill tone="success">URL built</StatusPill>
        ) : (
          <StatusPill tone="muted" icon={Loader2}>
            building
          </StatusPill>
        )
      }
    />
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
      <label className="mb-1.5 block text-[12.5px] font-medium">{label}</label>
      {children}
      {hint && (
        <p className="mt-1.5 text-[12px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

// RAR editor. The primary control is a raw JSON textarea — authorization_details
// is open-ended by design, so we validate only the array + per-object `type`
// and pass everything else through. Templates seed it; a chip strip reads back
// what's about to go on the wire in plain language.
function AuthorizationDetailsSection({
  req,
  update,
  supportedTypes,
}: {
  req: AuthRequestState;
  update: (patch: Partial<AuthRequestState>) => void;
  supportedTypes: string[];
}) {
  const enabled = req.authorizationDetailsEnabled;
  const trimmed = req.authorizationDetails.trim();
  const parsed = enabled && trimmed ? parseAuthorizationDetails(trimmed) : null;
  return (
    <Section
      title="Authorization details"
      description="Fine-grained access as a typed JSON array — an alternative or complement to scopes."
    >
      <div className="space-y-3">
        <Checkbox
          label="Request authorization_details"
          checked={enabled}
          onChange={(e) =>
            update({ authorizationDetailsEnabled: e.target.checked })
          }
        />

        {enabled && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11.5px] text-muted-foreground">
                Examples
              </span>
              {AUTHORIZATION_DETAILS_TEMPLATES.map((t) => (
                <Button
                  key={t.label}
                  type="button"
                  variant="secondary"
                  size="sm"
                  title={t.hint}
                  onClick={() => update({ authorizationDetails: t.value })}
                >
                  {t.label}
                </Button>
              ))}
            </div>

            <Textarea
              rows={10}
              spellCheck={false}
              className="font-mono text-[11.5px]"
              value={req.authorizationDetails}
              onChange={(e) => update({ authorizationDetails: e.target.value })}
              placeholder={
                '[\n  { "type": "Accounts", "actions": ["ReadAccounts"], "identifier": "ACC12345" }\n]'
              }
            />

            {parsed && !parsed.ok && (
              <p className="text-[11.5px] text-[var(--status-warn)]">
                {parsed.message} — sent verbatim.
              </p>
            )}

            {parsed?.ok && (
              <AuthorizationDetailChips details={parsed.details} />
            )}

            {supportedTypes.length > 0 && (
              <details className="text-[11.5px] text-muted-foreground">
                <summary className="cursor-pointer select-none">
                  Types this AS supports ({supportedTypes.length})
                </summary>
                <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1">
                  {supportedTypes.map((t) => (
                    <code key={t} className="font-mono text-foreground">
                      {t}
                    </code>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </Section>
  );
}

// Grant management request params. `grant_management_action` decides what this
// authorization does to the grant; update/replace/merge also need the grant_id.
// Orthogonal to RAR — a grant records whatever was consented (scopes, claims,
// authorization_details).
function GrantManagementSection({
  req,
  update,
  actions,
  required,
  onToggleScope,
}: {
  req: AuthRequestState;
  update: (patch: Partial<AuthRequestState>) => void;
  actions: string[];
  required: boolean;
  onToggleScope: (scope: string) => void;
}) {
  const action = req.grantManagementAction;
  const needsGrantId =
    action === "update" || action === "replace" || action === "merge";

  // When the AS mandates an action, there's no "none" — seed the first one so
  // the control and the wire value never disagree.
  useEffect(() => {
    if (required && !action && actions.length) {
      update({ grantManagementAction: actions[0] });
    }
  }, [required, action, actions, update]);

  return (
    <Section
      title="Grant management"
      description="Create or modify the grant this authorization establishes. The grant records the consent — scopes, claims, and any authorization_details."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="grant_management_action"
            hint={
              required
                ? "This AS requires an action on every request."
                : "How this request affects the grant."
            }
          >
            <Select
              value={action || (required ? actions[0] : "")}
              onChange={(e) =>
                update({ grantManagementAction: e.target.value })
              }
            >
              {!required && <option value="">none</option>}
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </Field>

          {needsGrantId && (
            <Field label="grant_id" hint="The existing grant to modify.">
              <Input
                mono
                value={req.grantId}
                onChange={(e) => update({ grantId: e.target.value })}
                placeholder="grant_id from a previous run"
                className="h-9"
              />
            </Field>
          )}
        </div>

        {!!action && (
          <div>
            <p className="text-[11.5px] text-muted-foreground">
              To query or revoke this grant later, the token needs these scopes:
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {GRANT_MANAGEMENT_SCOPES.map((s) => {
                const on = req.scopes.includes(s);
                return (
                  <button
                    type="button"
                    key={s}
                    onClick={() => onToggleScope(s)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px]",
                      on
                        ? "border-[var(--status-success)]/40 bg-[color-mix(in_oklch,var(--status-success)_10%,transparent)]"
                        : "border-border bg-muted/50 hover:bg-muted",
                    )}
                  >
                    {on ? "✓" : "+"} {s}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

function ParamRow({
  label,
  value,
  onRegen,
  hint,
  secondary,
  regenerating,
}: {
  label: string;
  value: string;
  onRegen: () => void;
  hint?: string;
  secondary?: ReactNode;
  regenerating?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="w-32 shrink-0 text-[12.5px] font-medium">{label}</span>
        <code className="flex-1 truncate rounded-sm bg-muted/40 px-2 py-1 font-mono text-[12px]">
          {value || "…"}
        </code>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Regenerate ${label}`}
          title="Regenerate"
          onClick={onRegen}
        >
          {regenerating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      {secondary && <div className="ml-32 mt-1 pl-2">{secondary}</div>}
      {hint && (
        <p className="ml-32 mt-1 pl-2 text-[11.5px] text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function AdvancedExpander({
  req,
  update,
}: {
  req: AuthRequestState;
  update: (patch: Partial<AuthRequestState>) => void;
}) {
  const trustChainWarning = useMemo(
    () => validateTrustChain(req.trustChain),
    [req.trustChain],
  );
  // A disclosure, not a Section — optional params shouldn't carry permanent
  // visual weight. Once open, though, the body follows the same two-level
  // grammar as the Sections around it (description left, controls right).
  return (
    <details className="rounded-lg border border-border bg-muted/20 p-4 text-[13px] @4xl:px-5">
      <summary className="cursor-pointer select-none text-[13px] font-semibold leading-5">
        Advanced{" "}
        <span className="font-normal text-muted-foreground">
          (prompt, max_age, login_hint, trust_chain)
        </span>
      </summary>
      <div className="mt-4 @4xl:grid @4xl:grid-cols-[220px_1fr] @4xl:gap-8">
        <p className="mb-4 text-[12px] leading-relaxed text-muted-foreground @4xl:mb-0">
          Rarely-needed request parameters — sent only when non-empty.
        </p>
        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="prompt" hint="none, login, consent, select_account">
              <Input
                mono
                value={req.prompt}
                onChange={(e) => update({ prompt: e.target.value })}
                placeholder=""
                className="h-8"
              />
            </Field>
            <Field label="max_age" hint="Seconds since user authentication.">
              <Input
                mono
                inputMode="numeric"
                value={req.maxAge}
                onChange={(e) => update({ maxAge: e.target.value })}
                placeholder=""
                className="h-8"
              />
            </Field>
            <Field label="login_hint" hint="Hint about the user account.">
              <Input
                mono
                value={req.loginHint}
                onChange={(e) => update({ loginHint: e.target.value })}
                placeholder=""
                className="h-8"
              />
            </Field>
          </div>
          <Field
            label="trust_chain"
            hint="OpenID Federation: JSON array of entity statement JWTs — [RP, intermediates…, Trust Anchor]."
          >
            <Textarea
              rows={4}
              spellCheck={false}
              className="font-mono text-[11.5px]"
              value={req.trustChain}
              onChange={(e) => update({ trustChain: e.target.value })}
              placeholder='[ "eyJhbGciOi...", "eyJhbGciOi..." ]'
            />
            {trustChainWarning && (
              <p className="mt-1 text-[11.5px] text-[var(--status-warn)]">
                {trustChainWarning}
              </p>
            )}
          </Field>
        </div>
      </div>
    </details>
  );
}

// The live-signed JAR request object, decoded with the same viewer the Token
// Inspector and Federation steps use. Signed by the store the instant a valid
// key + params exist — this is the actual JWT the "Final Request" above sends.
// Collapsed by default (like Advanced): a drill-down, not the main event.
function RequestObjectPanel({
  req,
  issuer,
}: {
  req: AuthRequestState;
  issuer?: string;
}) {
  const parsed = req.requestObjectJwt ? parseJwt(req.requestObjectJwt) : null;
  const signed = parsed?.ok ? parsed.jwt : null;
  const summary = req.requestObjectError
    ? "signing error"
    : signed
      ? `${signed.header.alg ?? "?"}${
          signed.header.kid ? ` · kid=${signed.header.kid}` : ""
        }`
      : "signing…";
  return (
    <details className="rounded-lg border border-border bg-muted/20 p-4 text-[13px] @4xl:px-5">
      <summary className="flex cursor-pointer select-none items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold leading-5">
          Decoded request object{" "}
          <span className="font-normal text-muted-foreground">(JAR)</span>
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {summary}
        </span>
      </summary>
      <div className="mt-4 @4xl:grid @4xl:grid-cols-[220px_1fr] @4xl:gap-8">
        <p className="mb-4 text-[12px] leading-relaxed text-muted-foreground @4xl:mb-0">
          The signed JWT the request carries — re-signed on every relevant edit.
        </p>
        <div className="min-w-0">
          {req.requestObjectError ? (
            <div className="rounded-md border border-[var(--status-error)]/40 bg-[color-mix(in_oklch,var(--status-error)_8%,transparent)] p-3 text-[12.5px]">
              {req.requestObjectError}
            </div>
          ) : signed ? (
            <JwtPanel
              jwt={signed}
              payloadSubtitle={issuer ? `aud=${issuer}` : undefined}
            />
          ) : (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-[12.5px] text-muted-foreground">
              Signing…
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

// Soft validation — surface a warning but never block. The AS rejects malformed
// chains; the Playground stays generic.
function validateTrustChain(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return "Not valid JSON.";
  }
  if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== "string")) {
    return "Expected a JSON array of JWT strings.";
  }
  return null;
}
