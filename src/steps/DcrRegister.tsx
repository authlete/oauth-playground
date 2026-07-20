// Step 2.x: Dynamic Client Registration (RFC 7591).
//
// Visible only when discovery surfaces a `registration_endpoint`. The user
// fills a subset of client metadata; the AS returns the issued client_id (and
// optional client_secret + RFC 7592 management fields). "Use this client"
// feeds the credentials into step 2 so the OAuth flows run with it.

import { useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Check, Copy, Eye, EyeOff, Loader2, RotateCw } from "lucide-react";
import { usePlayground } from "../store/playground";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import { Checkbox } from "../components/ui/Checkbox";
import {
  Banner,
  ErrorPanel,
  InfoCard,
  KV,
  KVList,
  StatusPill,
  StepHeader,
  type StatusTone,
} from "../components/step";
import { buildRegistrationRequest, parseRedirectUris, registerClient } from "../lib/dcrClient";
import {
  DCR_GRANT_TYPES,
  type ClientAuthMethod,
  type DcrRegisteredClient,
  type DcrRegisterStatus,
} from "../types";

// Only the auth methods a public/secret-based DCR can pick without also
// registering a JWKS (private_key_jwt needs keys — out of scope for this form).
const AUTH_METHODS: Array<{ value: ClientAuthMethod; label: string }> = [
  { value: "none", label: "none (public — PKCE)" },
  { value: "client_secret_basic", label: "client_secret_basic" },
  { value: "client_secret_post", label: "client_secret_post" },
];
const SUPPORTED_AUTH_METHODS = AUTH_METHODS.map((m) => m.value as string);

export function DcrRegisterStep() {
  const {
    state,
    dcrRegisterUpdate,
    clientUpdate,
    setActiveStep,
    networkAdd,
    networkUpdate,
  } = usePlayground();
  const reg = state.dcrRegister;
  const endpoint = state.discovery.metadata?.registration_endpoint;

  const request = useMemo(
    () =>
      buildRegistrationRequest({
        clientName: reg.clientName,
        redirectUris: reg.redirectUris,
        tokenEndpointAuthMethod: reg.tokenEndpointAuthMethod,
        grantTypes: reg.grantTypes,
        scope: reg.scope,
      }),
    [reg.clientName, reg.redirectUris, reg.tokenEndpointAuthMethod, reg.grantTypes, reg.scope],
  );

  const hasRedirect =
    reg.grantTypes.includes("authorization_code")
      ? reg.redirectUris.trim().length > 0
      : true;
  const canSubmit = !!endpoint && reg.grantTypes.length > 0 && hasRedirect;

  const onSubmit = async () => {
    if (!endpoint || !canSubmit) return;
    dcrRegisterUpdate({
      status: "loading",
      result: undefined,
      errorMessage: undefined,
      errorStatus: undefined,
      errorBody: undefined,
    });
    const result = await registerClient({
      endpoint,
      request,
      onStart: networkAdd,
      onFinish: networkUpdate,
    });
    if (result.ok) {
      dcrRegisterUpdate({
        status: "success",
        result: result.client,
        registeredAt: Date.now(),
      });
    } else {
      dcrRegisterUpdate({
        status: "error",
        errorMessage: result.message,
        errorStatus: result.status,
        errorBody: result.body,
      });
    }
  };

  const toggleGrant = (g: string) => {
    const has = reg.grantTypes.includes(g);
    dcrRegisterUpdate({
      grantTypes: has
        ? reg.grantTypes.filter((x) => x !== g)
        : [...reg.grantTypes, g],
    });
  };

  const onUseClient = () => {
    const c = reg.result;
    if (!c) return;
    // Adopt the AS-echoed auth method only if this form supports it (guards
    // against the AS returning a method we can't drive here, e.g. mTLS);
    // otherwise keep the method the user picked, which is always supported.
    const echoedAuth = c.raw.token_endpoint_auth_method;
    const authMethod =
      typeof echoedAuth === "string" && SUPPORTED_AUTH_METHODS.includes(echoedAuth)
        ? (echoedAuth as ClientAuthMethod)
        : reg.tokenEndpointAuthMethod;
    // Prefer the AS-echoed redirect, then the form's first, then step 2's.
    const echoedRedirects = Array.isArray(c.raw.redirect_uris) ? c.raw.redirect_uris : [];
    const redirectUri =
      (typeof echoedRedirects[0] === "string" && echoedRedirects[0]) ||
      parseRedirectUris(reg.redirectUris)[0] ||
      state.client.redirectUri;
    clientUpdate({
      clientId: c.clientId,
      clientSecret: c.clientSecret ?? "",
      authMethod,
      redirectUri,
    });
    setActiveStep("auth-request");
  };

  return (
    <div className="mx-auto max-w-3xl">
      <StepHeader
        stepLabel="Optional"
        title="Dynamic client registration"
        titleSuffix="branches off step 2"
        right={renderPill(reg.status)}
      />

      {!endpoint && (
        <Banner tone="warn" className="mt-5">
          This AS does not advertise <code>registration_endpoint</code>.
        </Banner>
      )}

      {endpoint && (
        <>
          <InfoCard label="Will POST" url={endpoint} className="mt-5">
            <p className="text-muted-foreground">
              RFC 7591 Dynamic Client Registration — open registration, no client auth.
            </p>
          </InfoCard>

          <div className="mt-6 space-y-5">
            <Field label="client_name" hint="Human-readable name shown on the consent screen.">
              <Input
                mono
                value={reg.clientName}
                onChange={(e) => dcrRegisterUpdate({ clientName: e.target.value })}
                placeholder="OAuth Playground"
              />
            </Field>

            <Field
              label="redirect_uris"
              hint="One per line. Required for the authorization_code grant."
            >
              <Textarea
                mono
                rows={2}
                spellCheck={false}
                className="text-[12px]"
                value={reg.redirectUris}
                onChange={(e) => dcrRegisterUpdate({ redirectUris: e.target.value })}
                placeholder="http://localhost:5173/callback"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="token_endpoint_auth_method"
                hint="How the registered client authenticates at /token."
              >
                <Select
                  value={reg.tokenEndpointAuthMethod}
                  onChange={(e) =>
                    dcrRegisterUpdate({
                      tokenEndpointAuthMethod: e.target.value as ClientAuthMethod,
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

              <Field label="scope" hint="Space-separated scopes to register for.">
                <Input
                  mono
                  value={reg.scope}
                  onChange={(e) => dcrRegisterUpdate({ scope: e.target.value })}
                  placeholder="openid profile email"
                />
              </Field>
            </div>

            <Field label="grant_types" hint="response_types is derived (code for authorization_code).">
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {DCR_GRANT_TYPES.map((g) => (
                  <Checkbox
                    key={g}
                    label={g}
                    checked={reg.grantTypes.includes(g)}
                    onChange={() => toggleGrant(g)}
                  />
                ))}
              </div>
            </Field>

            <div>
              <div className="mb-1.5 text-[12.5px] font-medium">Request body</div>
              <pre className="max-h-[220px] overflow-auto rounded-md border border-border bg-background/60 p-3 font-mono text-[11.5px] leading-relaxed">
                {JSON.stringify(request, null, 2)}
              </pre>
            </div>

            <div className="flex flex-wrap gap-2">
              {reg.status === "loading" ? (
                <Button disabled>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Registering…
                </Button>
              ) : reg.status === "success" ? (
                <Button variant="secondary" onClick={onSubmit} disabled={!canSubmit}>
                  <RotateCw className="h-4 w-4" />
                  Re-register
                </Button>
              ) : (
                <Button onClick={onSubmit} disabled={!canSubmit}>
                  <ArrowRight className="h-4 w-4" />
                  Register
                </Button>
              )}
            </div>

            {reg.status === "success" && reg.result && (
              <SuccessPanel
                client={reg.result}
                onUse={onUseClient}
                applied={reg.result.clientId === state.client.clientId}
              />
            )}

            {reg.status === "error" && (
              <ErrorPanel
                message={reg.errorMessage ?? "Unknown error."}
                status={reg.errorStatus}
                body={reg.errorBody}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SuccessPanel({
  client,
  onUse,
  applied,
}: {
  client: DcrRegisteredClient;
  onUse: () => void;
  applied: boolean;
}) {
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(client.clientId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };
  return (
    <div className="space-y-4">
      <Banner tone="success" className="p-4">
        <p className="flex items-center gap-1.5 text-[13.5px] font-medium">
          <Check className="h-4 w-4 text-[var(--status-success)]" />
          Client registered.
        </p>
        <KVList className="mt-3">
          <KV label="client_id" labelWidth="w-40">
            <span className="inline-flex items-center gap-2">
              <code className="font-mono">{client.clientId}</code>
              <Button variant="ghost" size="sm" onClick={copyId} className="shrink-0">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </span>
          </KV>
          {client.clientSecret && (
            <KV label="client_secret" labelWidth="w-40">
              <span className="inline-flex items-center gap-2">
                <code className="font-mono break-all">
                  {showSecret ? client.clientSecret : "•".repeat(24)}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSecret((v) => !v)}
                  className="shrink-0"
                >
                  {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </span>
            </KV>
          )}
          <KV label="client_secret_expires_at" labelWidth="w-40">
            <span className="font-mono">
              {client.clientSecretExpiresAt === 0 || client.clientSecretExpiresAt === undefined
                ? "0 (never)"
                : new Date(client.clientSecretExpiresAt * 1000).toISOString()}
            </span>
          </KV>
          {client.registrationClientUri && (
            <KV label="registration_client_uri" labelWidth="w-40">
              <code className="font-mono break-all text-[11.5px]">
                {client.registrationClientUri}
              </code>
            </KV>
          )}
          {client.registrationAccessToken && (
            <KV label="registration_access_token" labelWidth="w-40">
              <code className="font-mono break-all text-[11.5px]">
                {client.registrationAccessToken}
              </code>
            </KV>
          )}
        </KVList>
        <div className="mt-3">
          <Button onClick={onUse} disabled={applied} size="sm">
            {applied ? "Applied to step 2" : "Use this client →"}
          </Button>
        </div>
      </Banner>

      <details className="rounded-md border border-border bg-card/40 px-3 py-2 text-[13px]">
        <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
          Full registration response
        </summary>
        <pre className="mt-3 max-h-[320px] overflow-auto rounded-sm bg-background/60 p-3 font-mono text-[11.5px] leading-relaxed">
          {JSON.stringify(client.raw, null, 2)}
        </pre>
      </details>
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
      <label className="mb-1.5 block text-[12.5px] font-medium">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-[12px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function renderPill(status: DcrRegisterStatus) {
  if (status === "idle") return null;
  const map: Record<
    Exclude<typeof status, "idle">,
    { tone: StatusTone; label: string; spinning?: boolean }
  > = {
    loading: { tone: "muted", label: "registering", spinning: true },
    success: { tone: "success", label: "registered" },
    error: { tone: "error", label: "failed" },
  };
  const p = map[status];
  return (
    <StatusPill tone={p.tone} spinning={p.spinning}>
      {p.label}
    </StatusPill>
  );
}
