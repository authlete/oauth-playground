import {
  useCallback,
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
import { StatusPill, StepHeader } from "../components/step";
import { computeCodeChallenge, generateCodeVerifier } from "../lib/pkce";
import { randomBase64Url } from "../lib/random";
import { buildAuthorizeUrl } from "../lib/authorizeUrl";
import {
  COMMON_SCOPES,
  type AuthRequestState,
  type ResponseMode,
} from "../types";

const RESPONSE_TYPES = ["code", "id_token", "code id_token", "token"];

const RESPONSE_MODES: Array<{ value: ResponseMode; label: string }> = [
  { value: "query", label: "query (default for code)" },
  { value: "fragment", label: "fragment" },
  { value: "form_post", label: "form_post (OAuth 2.0 FOSS)" },
];

export function AuthRequestStep() {
  const {
    state,
    authRequestUpdate,
    parUpdate,
    setActiveStep,
  } = usePlayground();
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

  const isValid = builtUrl.ok && req.scopes.length > 0;


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
        scopes: has ? req.scopes.filter((s) => s !== scope) : [...req.scopes, scope],
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
    const value = kind === "url" ? builtUrl.url : `curl -i -L '${builtUrl.url.replace(/'/g, "'\\''")}'`;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied((cur) => (cur === kind ? null : cur)), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Header valid={isValid} />

      {!metadata && (
        <div className="mt-5 rounded-md border border-[var(--status-warn)]/40 bg-[color-mix(in_oklch,var(--status-warn)_8%,transparent)] p-3 text-[13px]">
          <p>
            Run Discovery first — this step needs{" "}
            <code className="font-mono">authorization_endpoint</code> from the AS.
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

      <div className="mt-6 space-y-5">
        <Field label="Scopes" hint="Space-separated values sent in the `scope` query param.">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {COMMON_SCOPES.map((s) => (
              <Checkbox
                key={s}
                label={s}
                checked={req.scopes.includes(s)}
                onChange={() => toggleScope(s)}
              />
            ))}
          </div>
          {req.scopes.some((s) => !(COMMON_SCOPES as readonly string[]).includes(s)) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {req.scopes
                .filter((s) => !(COMMON_SCOPES as readonly string[]).includes(s))
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
              onChange={(e) => authRequestUpdate({ customScope: e.target.value })}
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
          <Field label="response_type" hint="OAuth 2.0 §3.1.1 — what the AS returns at the callback.">
            <Select
              value={req.responseType}
              onChange={(e) => authRequestUpdate({ responseType: e.target.value })}
            >
              {RESPONSE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="response_mode" hint="How the AS delivers the response to the redirect URI.">
            <Select
              value={req.responseMode}
              onChange={(e) =>
                authRequestUpdate({ responseMode: e.target.value as ResponseMode })
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

        <Field
          label="Extensions"
          hint="PKCE is on by default for any v0.1 client. PAR / JAR / JARM ship in later build steps."
        >
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Checkbox
              label="PKCE (S256, RFC 7636)"
              checked={req.pkceEnabled}
              onChange={(e) => authRequestUpdate({ pkceEnabled: e.target.checked })}
            />
            <Checkbox
              label={
                parSupported
                  ? "PAR (RFC 9126)"
                  : "PAR (RFC 9126) — AS does not advertise an endpoint"
              }
              checked={parEnabled}
              disabled={!parSupported}
              onChange={(e) => parUpdate({ enabled: e.target.checked })}
            />
            <Checkbox label="JAR (RFC 9101)" checked={false} disabled />
            <Checkbox label="JARM (response_mode=jwt)" checked={false} disabled />
          </div>
        </Field>

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
          hint="Bound into the ID token; mitigates replay (OIDC Core §3.1.2.1)."
        />
        {req.pkceEnabled && (
          <ParamRow
            label="code_verifier"
            value={req.codeVerifier}
            onRegen={regenPkce}
            regenerating={pkceRegenerating}
            hint="Held in memory; sent to /token at step 6. Challenge = SHA-256(verifier)."
            secondary={
              req.codeChallenge ? (
                <span className="font-mono text-[11.5px] text-muted-foreground">
                  code_challenge · {req.codeChallenge}{" "}
                  <span className="text-foreground">(S256)</span>
                </span>
              ) : (
                <span className="text-[11.5px] text-muted-foreground">computing…</span>
              )
            }
          />
        )}

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
      </div>
    </div>
  );
}

function Header({ valid }: { valid: boolean }) {
  return (
    <StepHeader
      stepNumber={3}
      title="Authorization request"
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
      {hint && <p className="mt-1.5 text-[12px] text-muted-foreground">{hint}</p>}
    </div>
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
      {hint && <p className="ml-32 mt-1 pl-2 text-[11.5px] text-muted-foreground">{hint}</p>}
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
  return (
    <details className="rounded-md border border-border bg-card/40 px-3 py-2 text-[13px]">
      <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
        Advanced (prompt, max_age, login_hint, trust_chain)
      </summary>
      <div className="mt-3 grid grid-cols-3 gap-3">
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
      <div className="mt-3">
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

