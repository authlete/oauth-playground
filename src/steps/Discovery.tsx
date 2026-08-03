import { useState, type FormEvent, type ReactNode } from "react";
import { Loader2, RotateCw, Send } from "lucide-react";
import { usePlayground } from "../store/playground";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import {
  Banner,
  Section,
  StatusPill,
  StepHeader as SharedStepHeader,
} from "../components/step";
import { cn } from "../lib/cn";
import { AUTH_SERVERS } from "../lib/authServers";
import {
  RESOURCE_SERVERS,
  DEFAULT_RESOURCE_SERVER,
} from "../lib/resourceServers";
import { fetchDiscovery, type DiscoveryError } from "../lib/discovery";
import { fetchOpenApiOperations } from "../lib/openapi";
import { fetchPrm } from "../lib/prm";
import { applyManual } from "../lib/manualDiscovery";
import type { ManualEndpoints, OidcMetadata, PrmDocument } from "../types";

type Tab = "endpoints" | "jwks";

// Sentinel <option> for "not one of the configured servers — type your own".
const CUSTOM_SERVER = "__custom__";
// The picker only exists when a deployment configures servers (VITE_AUTH_SERVERS);
// with just the local-dev fallback a lone free-text input is enough.
const HAS_PRESETS = AUTH_SERVERS.length > 1;
const HAS_RESOURCE_PRESETS = RESOURCE_SERVERS.length > 1;

export function DiscoveryStep() {
  const { state, discoveryUpdate, resourceUpdate, networkAdd, networkUpdate } =
    usePlayground();
  const discovery = state.discovery;
  const resource = state.resource;
  const isLoading = discovery.status === "loading";

  const [tab, setTab] = useState<Tab>("endpoints");
  const [issuerInput, setIssuerInput] = useState(discovery.issuer);
  const [resourceInput, setResourceInput] = useState(
    resource.url || DEFAULT_RESOURCE_SERVER,
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    await runDiscovery(issuerInput);
  };

  // RFC 9728: fetch the resource's PRM; with exactly one advertised AS, chain
  // straight into issuer discovery so one click completes the whole hop.
  const onFetchPrm = async (e: FormEvent) => {
    e.preventDefault();
    if (resource.status === "loading" || isLoading) return;
    resourceUpdate({
      status: "loading",
      url: resourceInput,
      prm: undefined,
      metadataUrl: undefined,
      operations: undefined,
      errorMessage: undefined,
      errorStatus: undefined,
      errorBody: undefined,
    });
    const result = await fetchPrm(resourceInput, {
      onStart: networkAdd,
      onFinish: networkUpdate,
    });
    if (!result.ok) {
      resourceUpdate({
        status: "error",
        errorMessage: errorMessage(result.error),
        errorStatus: "status" in result.error ? result.error.status : undefined,
        errorBody: "body" in result.error ? result.error.body : undefined,
      });
      return;
    }
    resourceUpdate({
      status: "success",
      prm: result.prm,
      metadataUrl: result.metadataUrl,
    });
    // Opportunistic: if the resource also publishes an OpenAPI document, the
    // Resource call step can offer its operations. A 404 here is fine.
    const operations = await fetchOpenApiOperations(resourceInput, {
      onStart: networkAdd,
      onFinish: networkUpdate,
    });
    if (operations) resourceUpdate({ operations });
    const servers = result.prm.authorization_servers ?? [];
    if (servers.length === 1) {
      setIssuerInput(servers[0]);
      await runDiscovery(servers[0]);
    }
  };

  async function runDiscovery(issuer: string) {
    discoveryUpdate({
      status: "loading",
      issuer,
      errorMessage: undefined,
      errorBody: undefined,
      errorStatus: undefined,
      metadata: undefined,
      jwks: undefined,
      durationMs: undefined,
    });

    const result = await fetchDiscovery(issuer, {
      onStart: (entry) => networkAdd(entry),
      onFinish: (id, patch) => networkUpdate(id, patch),
    });

    if (!result.ok) {
      discoveryUpdate({
        status: errorStatusFromKind(result.error),
        errorMessage: errorMessage(result.error),
        errorBody: "body" in result.error ? result.error.body : undefined,
        errorStatus: "status" in result.error ? result.error.status : undefined,
        durationMs: result.durationMs,
      });
      return;
    }

    const partial = !!result.jwksError;
    discoveryUpdate({
      status: partial ? "partial" : "success",
      metadata: result.metadata,
      jwks: result.jwks,
      errorMessage: result.jwksError
        ? `JWKS fetch failed: ${errorMessage(result.jwksError)}`
        : undefined,
      durationMs: result.durationMs,
      // Prefill the Manual form with discovered values so a user who later
      // switches to Manual sees them already populated for editing.
      manual: {
        issuer: result.metadata.issuer ?? discovery.manual.issuer,
        authorization_endpoint:
          asString(result.metadata.authorization_endpoint) ||
          discovery.manual.authorization_endpoint,
        token_endpoint:
          asString(result.metadata.token_endpoint) ||
          discovery.manual.token_endpoint,
        jwks_uri:
          asString(result.metadata.jwks_uri) || discovery.manual.jwks_uri,
        userinfo_endpoint:
          asString(result.metadata.userinfo_endpoint) ||
          discovery.manual.userinfo_endpoint,
        introspection_endpoint:
          asString(result.metadata.introspection_endpoint) ||
          discovery.manual.introspection_endpoint,
        revocation_endpoint:
          asString(result.metadata.revocation_endpoint) ||
          discovery.manual.revocation_endpoint,
        pushed_authorization_request_endpoint:
          asString(result.metadata.pushed_authorization_request_endpoint) ||
          discovery.manual.pushed_authorization_request_endpoint,
        federation_registration_endpoint:
          asString(result.metadata.federation_registration_endpoint) ||
          discovery.manual.federation_registration_endpoint,
      },
    });
  }

  return (
    <div className="mx-auto max-w-3xl @4xl:max-w-5xl">
      <StepHeader status={discovery.status} durationMs={discovery.durationMs} />

      <ModeTabs
        mode={discovery.mode}
        onChange={(mode) => discoveryUpdate({ mode })}
      />

      {discovery.mode === "wellknown" && (
        <>
          <ServerForm
            idPrefix="issuer"
            ariaLabel="Authorization server"
            presets={AUTH_SERVERS}
            value={issuerInput}
            onChange={setIssuerInput}
            placeholder="https://your-as.example.com"
            loading={isLoading}
            succeeded={
              discovery.status === "success" || discovery.status === "partial"
            }
            onSubmit={onSubmit}
          />

          {discovery.status === "idle" && (
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              {HAS_PRESETS
                ? "Pick a configured server (or Custom… for any issuer URL), then Run — "
                : "Type any issuer URL, then Run — "}
              the playground fetches{" "}
              <code className="font-mono">
                /.well-known/openid-configuration
              </code>
              .
            </p>
          )}
        </>
      )}

      {discovery.mode === "resource" && (
        <>
          <ServerForm
            idPrefix="resource"
            ariaLabel="Protected resource"
            presets={RESOURCE_SERVERS}
            value={resourceInput}
            onChange={setResourceInput}
            placeholder="https://api.example.com"
            loading={resource.status === "loading" || isLoading}
            succeeded={resource.status === "success"}
            onSubmit={onFetchPrm}
          />

          {resource.status === "idle" && (
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              {HAS_RESOURCE_PRESETS
                ? "Pick a configured resource (or Custom… for any URL), then Run — "
                : "Type a protected resource URL, then Run — "}
              the playground fetches{" "}
              <code className="font-mono">
                /.well-known/oauth-protected-resource
              </code>{" "}
              (RFC 9728) and discovers the AS it names.
            </p>
          )}

          {resource.status === "error" && (
            <Banner tone="error" className="mt-4 p-4">
              <p className="font-medium">
                Couldn't fetch protected resource metadata
                {resource.errorStatus ? ` (${resource.errorStatus})` : ""}.
              </p>
              {resource.errorMessage && (
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  {resource.errorMessage}
                </p>
              )}
              {resource.errorBody && (
                <pre className="mt-2 max-h-[160px] overflow-auto rounded-sm bg-background/60 p-2 font-mono text-[11.5px] leading-relaxed">
                  {resource.errorBody}
                </pre>
              )}
            </Banner>
          )}

          {resource.status === "success" && resource.prm && (
            <PrmPanel
              prm={resource.prm}
              metadataUrl={resource.metadataUrl}
              discoveredIssuer={
                discovery.status === "success" || discovery.status === "partial"
                  ? discovery.issuer
                  : undefined
              }
              discovering={isLoading}
              onDiscover={(as) => {
                setIssuerInput(as);
                void runDiscovery(as);
              }}
            />
          )}
        </>
      )}

      {discovery.mode === "manual" && (
        <ManualForm
          endpoints={discovery.manual}
          prefilled={!!discovery.metadata}
          onChange={(patch) =>
            discoveryUpdate({ manual: { ...discovery.manual, ...patch } })
          }
          onApply={onApplyManual}
        />
      )}

      <div className="mt-6">
        <StateBody />
      </div>
    </div>
  );

  async function onApplyManual() {
    const m = discovery.manual;
    const result = await applyManual({
      endpoints: m,
      fetchJwks: !!m.jwks_uri.trim(),
      onStart: networkAdd,
      onFinish: networkUpdate,
    });
    if (!result.ok) {
      discoveryUpdate({
        status: "malformed",
        errorMessage: result.message,
        metadata: undefined,
        jwks: undefined,
      });
      return;
    }
    discoveryUpdate({
      status: result.jwks
        ? "success"
        : result.jwksError
          ? "partial"
          : "success",
      issuer: m.issuer,
      metadata: result.metadata,
      jwks: result.jwks,
      errorMessage: result.jwksError
        ? `JWKS fetch failed: ${result.jwksError}`
        : undefined,
      durationMs: 0,
    });
  }

  function StateBody() {
    switch (discovery.status) {
      case "idle":
      case "loading":
        return null;
      case "cors-error":
        return <CorsErrorPanel />;
      case "http-error":
        return (
          <HttpErrorPanel
            status={discovery.errorStatus ?? 0}
            body={discovery.errorBody ?? ""}
          />
        );
      case "network-error":
        return <NetworkErrorPanel message={discovery.errorMessage ?? ""} />;
      case "malformed":
        return (
          <MalformedPanel
            body={discovery.errorBody ?? ""}
            missing={(discovery.errorMessage ?? "")
              .split(",")
              .map((s) => s.trim())}
          />
        );
      case "partial":
      case "success":
        // Same section grammar as the PRM card above it; in resource mode the
        // description carries the attribution for the auto-chained second hop.
        return (
          <Section
            title="Authorization server metadata"
            description={
              discovery.mode === "resource" && resource.status === "success"
                ? "↳ discovered from the resource metadata above"
                : "OpenID Connect Discovery / RFC 8414"
            }
          >
            <SuccessPanel
              metadata={discovery.metadata!}
              jwks={discovery.jwks}
              jwksError={
                discovery.status === "partial"
                  ? discovery.errorMessage
                  : undefined
              }
              tab={tab}
              setTab={setTab}
            />
          </Section>
        );
    }
  }
}

function StepHeader({
  status,
  durationMs,
}: {
  status: ReturnType<typeof usePlayground>["state"]["discovery"]["status"];
  durationMs?: number;
}) {
  return (
    <SharedStepHeader step="discovery" right={renderPill(status, durationMs)} />
  );
}

type DiscoveryMode = "wellknown" | "resource" | "manual";

function ModeTabs({
  mode,
  onChange,
}: {
  mode: DiscoveryMode;
  onChange: (mode: DiscoveryMode) => void;
}) {
  return (
    <div className="mt-4 inline-flex rounded-md border border-border bg-card p-0.5 text-[12.5px]">
      <ModeTab
        active={mode === "wellknown"}
        onClick={() => onChange("wellknown")}
      >
        From issuer
      </ModeTab>
      <ModeTab
        active={mode === "resource"}
        onClick={() => onChange("resource")}
      >
        From resource
      </ModeTab>
      <ModeTab active={mode === "manual"} onClick={() => onChange("manual")}>
        Manual endpoints
      </ModeTab>
    </div>
  );
}

// One-row well-known form shared by the issuer and resource modes: preset
// picker + free-text input for Custom… + run button. With a single preset
// the picker collapses to just the input. Anything not in the preset list
// counts as custom.
function ServerForm({
  idPrefix,
  ariaLabel,
  presets,
  value,
  onChange,
  placeholder,
  loading,
  succeeded,
  onSubmit,
}: {
  idPrefix: string;
  ariaLabel: string;
  presets: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  loading: boolean;
  succeeded: boolean;
  onSubmit: (e: FormEvent) => void;
}) {
  const hasPresets = presets.length > 1;
  const isCustom = !presets.includes(value);
  return (
    <form onSubmit={onSubmit} className="mt-4 flex items-center gap-2">
      {hasPresets && (
        <>
          <label className="sr-only" htmlFor={`${idPrefix}-select`}>
            {ariaLabel}
          </label>
          <Select
            id={`${idPrefix}-select`}
            className={isCustom ? "w-36 shrink-0" : "flex-1"}
            value={isCustom ? CUSTOM_SERVER : value}
            disabled={loading}
            onChange={(e) => {
              if (e.target.value === CUSTOM_SERVER) {
                onChange("");
                window.requestAnimationFrame(() =>
                  document.getElementById(`${idPrefix}-input`)?.focus(),
                );
              } else {
                onChange(e.target.value);
              }
            }}
          >
            {presets.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value={CUSTOM_SERVER}>Custom…</option>
          </Select>
        </>
      )}
      {(!hasPresets || isCustom) && (
        <>
          <label className="sr-only" htmlFor={`${idPrefix}-input`}>
            {ariaLabel} URL
          </label>
          <Input
            id={`${idPrefix}-input`}
            mono
            className="flex-1"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={loading}
            autoComplete="off"
            spellCheck={false}
          />
        </>
      )}
      <Button type="submit" disabled={loading} className="shrink-0">
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Fetching…
          </>
        ) : succeeded ? (
          <>
            <RotateCw className="h-4 w-4" />
            Re-run
          </>
        ) : (
          "Run discovery"
        )}
      </Button>
    </form>
  );
}

// RFC 9728 Protected Resource Metadata, rendered after a successful fetch.
// Each advertised AS gets a Discover button; with a single AS the discovery
// already ran automatically and the button shows its result state.
function PrmPanel({
  prm,
  metadataUrl,
  discoveredIssuer,
  discovering,
  onDiscover,
}: {
  prm: PrmDocument;
  metadataUrl?: string;
  discoveredIssuer?: string;
  discovering: boolean;
  onDiscover: (issuer: string) => void;
}) {
  const servers = prm.authorization_servers ?? [];
  return (
    <Section
      title="Protected resource metadata"
      // Just the citation — the exact GET (full metadata URL, headers) lives
      // in the network log, not in prose.
      description={<span title={metadataUrl}>RFC 9728</span>}
      className="mt-4"
    >
      <div className="space-y-3 text-[12.5px]">
        <div>
          <span className="text-muted-foreground">resource:</span>{" "}
          <span className="font-mono">{prm.resource}</span>
        </div>

        {typeof prm.resource_name === "string" && (
          <div>
            <span className="text-muted-foreground">resource_name:</span>{" "}
            {prm.resource_name}
          </div>
        )}

        {Array.isArray(prm.scopes_supported) &&
          prm.scopes_supported.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground">scopes_supported:</span>
              {prm.scopes_supported.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-border bg-muted/50 px-2 py-0.5 font-mono text-[11px]"
                >
                  {s}
                </span>
              ))}
            </div>
          )}

        <div className="space-y-1.5">
          <span className="text-muted-foreground">authorization_servers:</span>
          {servers.map((as) => {
            const discovered = discoveredIssuer === as;
            return (
              <div key={as} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 break-all font-mono">{as}</span>
                <Button
                  size="sm"
                  variant={discovered ? "secondary" : "primary"}
                  disabled={discovering || discovered}
                  onClick={() => onDiscover(as)}
                  className="shrink-0"
                >
                  {discovered ? "Discovered ✓" : "Discover →"}
                </Button>
              </div>
            );
          })}
        </div>

        <details className="text-[12px]">
          <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
            Raw metadata
          </summary>
          <pre className="mt-2 max-h-[240px] overflow-auto rounded-md border border-border bg-background/60 p-3 font-mono text-[11.5px] leading-relaxed">
            {JSON.stringify(prm, null, 2)}
          </pre>
        </details>
      </div>
    </Section>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[5px] px-3 py-1.5 transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ManualForm({
  endpoints,
  prefilled,
  onChange,
  onApply,
}: {
  endpoints: ManualEndpoints;
  prefilled: boolean;
  onChange: (patch: Partial<ManualEndpoints>) => void;
  onApply: () => Promise<void>;
}) {
  const [applying, setApplying] = useState(false);
  const handleApply = async () => {
    setApplying(true);
    try {
      await onApply();
    } finally {
      setApplying(false);
    }
  };
  return (
    <div className="mt-4 space-y-4">
      <p className="text-[12.5px] text-muted-foreground">
        {prefilled
          ? "Pre-filled from the last successful Discovery — edit any endpoint to override."
          : "Use when the AS has no .well-known endpoint or you're targeting a stub/test server."}
      </p>

      <Section
        title="Required endpoints"
        description="The minimum the playground needs to run an authorization flow."
      >
        <div className="space-y-3">
          <ManualField
            label="issuer"
            hint="Compared against the iss param the AS echoes at the callback (RFC 9207)."
          >
            <Input
              mono
              value={endpoints.issuer}
              onChange={(e) => onChange({ issuer: e.target.value })}
              placeholder="https://my-as.example.com"
            />
          </ManualField>
          <ManualField label="authorization_endpoint">
            <Input
              mono
              value={endpoints.authorization_endpoint}
              onChange={(e) =>
                onChange({ authorization_endpoint: e.target.value })
              }
              placeholder="https://my-as.example.com/authorize"
            />
          </ManualField>
          <ManualField label="token_endpoint">
            <Input
              mono
              value={endpoints.token_endpoint}
              onChange={(e) => onChange({ token_endpoint: e.target.value })}
              placeholder="https://my-as.example.com/token"
            />
          </ManualField>
        </div>
      </Section>

      <Section
        title="Optional endpoints"
        description="Leave an endpoint blank and the matching step stays unavailable."
      >
        <div className="space-y-3">
          <ManualField
            label="jwks_uri"
            hint="Fetched on Apply; the Token inspector uses it to verify signatures."
          >
            <Input
              mono
              value={endpoints.jwks_uri}
              onChange={(e) => onChange({ jwks_uri: e.target.value })}
              placeholder="https://my-as.example.com/jwks"
            />
          </ManualField>
          <ManualField label="userinfo_endpoint">
            <Input
              mono
              value={endpoints.userinfo_endpoint}
              onChange={(e) => onChange({ userinfo_endpoint: e.target.value })}
            />
          </ManualField>
          <ManualField label="introspection_endpoint">
            <Input
              mono
              value={endpoints.introspection_endpoint}
              onChange={(e) =>
                onChange({ introspection_endpoint: e.target.value })
              }
            />
          </ManualField>
          <ManualField label="revocation_endpoint">
            <Input
              mono
              value={endpoints.revocation_endpoint}
              onChange={(e) =>
                onChange({ revocation_endpoint: e.target.value })
              }
            />
          </ManualField>
          <ManualField label="pushed_authorization_request_endpoint">
            <Input
              mono
              value={endpoints.pushed_authorization_request_endpoint}
              onChange={(e) =>
                onChange({
                  pushed_authorization_request_endpoint: e.target.value,
                })
              }
            />
          </ManualField>
          <ManualField label="federation_registration_endpoint">
            <Input
              mono
              value={endpoints.federation_registration_endpoint}
              onChange={(e) =>
                onChange({
                  federation_registration_endpoint: e.target.value,
                })
              }
            />
          </ManualField>
        </div>
      </Section>

      <div className="flex flex-wrap gap-2 pt-2">
        <Button onClick={handleApply} disabled={applying}>
          {applying ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Applying…
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Apply endpoints
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function ManualField({
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
      <label className="mb-1 block font-mono text-[11.5px] text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && (
        <p className="mt-1 text-[11.5px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function renderPill(
  status: ReturnType<typeof usePlayground>["state"]["discovery"]["status"],
  durationMs?: number,
) {
  if (status === "idle") return null;
  if (status === "loading")
    return (
      <StatusPill tone="muted" spinning>
        Fetching…
      </StatusPill>
    );
  if (status === "success")
    return <StatusPill tone="success">done · {durationMs}ms</StatusPill>;
  if (status === "partial")
    return <StatusPill tone="warn">partial · {durationMs}ms</StatusPill>;
  return <StatusPill tone="error">failed</StatusPill>;
}

function ErrorBanner({
  tone,
  children,
}: {
  tone: "error" | "warn";
  children: React.ReactNode;
}) {
  return (
    <Banner tone={tone} className="p-4 text-[13.5px]">
      {children}
    </Banner>
  );
}

function CorsErrorPanel() {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "the playground";
  return (
    <ErrorBanner tone="error">
      <p className="font-medium">CORS blocked.</p>
      <p className="mt-1 text-[13px]">
        This AS isn't allowing browser requests from origin{" "}
        <code className="font-mono">{origin}</code>.
      </p>
      <details className="mt-3 text-[13px]">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          What's happening?
        </summary>
        <div className="mt-2 space-y-2 pl-4 text-muted-foreground">
          <p>
            The playground runs entirely in your browser, so every request is
            subject to CORS. The AS answered without an{" "}
            <code className="font-mono">Access-Control-Allow-Origin</code>{" "}
            header, so the browser withheld the response. To fix it:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              Enable CORS on the target AS for{" "}
              <code className="font-mono">{origin}</code>, or
            </li>
            <li>
              Serve the playground at{" "}
              <code className="font-mono">/playground/*</code> on the same
              origin as the AS.
            </li>
          </ul>
        </div>
      </details>
    </ErrorBanner>
  );
}

function HttpErrorPanel({ status, body }: { status: number; body: string }) {
  return (
    <ErrorBanner tone="error">
      <p className="font-medium">AS returned {status}.</p>
      {body && (
        <pre className="mt-3 max-h-[240px] overflow-auto rounded-sm bg-background/60 p-2 font-mono text-[12px] leading-relaxed">
          {body}
        </pre>
      )}
    </ErrorBanner>
  );
}

function NetworkErrorPanel({ message }: { message: string }) {
  return (
    <ErrorBanner tone="error">
      <p className="font-medium">Couldn't reach the AS.</p>
      <p className="mt-1 text-[13px]">
        Check the URL and that the AS is running.
      </p>
      {message && (
        <p className="mt-2 font-mono text-[12px] text-muted-foreground">
          {message}
        </p>
      )}
    </ErrorBanner>
  );
}

function MalformedPanel({
  body,
  missing,
}: {
  body: string;
  missing: string[];
}) {
  return (
    <ErrorBanner tone="warn">
      <p className="font-medium">
        Got a response but it doesn't look like OIDC metadata.
      </p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Missing required field{missing.length === 1 ? "" : "s"}:{" "}
        <span className="font-mono text-foreground">{missing.join(", ")}</span>
      </p>
      {body && (
        <pre className="mt-3 max-h-[240px] overflow-auto rounded-sm bg-background/60 p-2 font-mono text-[12px] leading-relaxed">
          {body}
        </pre>
      )}
    </ErrorBanner>
  );
}

function SuccessPanel({
  metadata,
  jwks,
  jwksError,
  tab,
  setTab,
}: {
  metadata: OidcMetadata;
  jwks?: { keys: Array<Record<string, unknown>> };
  jwksError?: string;
  tab: Tab;
  setTab: (t: Tab) => void;
}) {
  const endpoints = collectEndpoints(metadata);
  return (
    <div>
      {jwksError && (
        <div className="mb-3">
          <ErrorBanner tone="warn">
            <p className="font-medium">{jwksError}</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Endpoints are usable; JWKS will be needed for token verification.
            </p>
          </ErrorBanner>
        </div>
      )}

      <div className="flex items-center gap-4 border-b border-border">
        <TabButton
          active={tab === "endpoints"}
          onClick={() => setTab("endpoints")}
        >
          Endpoints ({endpoints.length})
        </TabButton>
        <TabButton active={tab === "jwks"} onClick={() => setTab("jwks")}>
          JWKS ({jwks?.keys?.length ?? 0} keys)
        </TabButton>
      </div>

      <div className="mt-4">
        {tab === "endpoints" && <EndpointTable endpoints={endpoints} />}
        {tab === "jwks" && (
          <JwksList keys={jwks?.keys ?? []} hasError={!!jwksError} />
        )}
      </div>

      {/* Raw document is a drill-down, not a coequal view — same affordance
          as the PRM card's raw expander (and DCR's full response). */}
      <details className="mt-4 text-[12px]">
        <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
          Raw metadata
        </summary>
        <pre className="mt-2 max-h-[480px] overflow-auto rounded-md border border-border bg-background/60 p-3 font-mono text-[12px] leading-relaxed">
          {JSON.stringify(metadata, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-1 pb-2 text-[13px] transition-colors",
        active
          ? "border-[var(--playground-accent)] text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function EndpointTable({
  endpoints,
}: {
  endpoints: Array<{ name: string; value: string }>;
}) {
  if (endpoints.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        This AS only advertises the standard endpoints.
      </p>
    );
  }
  return (
    <table className="w-full text-[12.5px]">
      <tbody>
        {endpoints.map((row) => (
          <tr key={row.name} className="border-b border-border/60">
            <td className="w-[260px] py-2 pr-4 align-top text-muted-foreground">
              {row.name}
            </td>
            <td className="break-all py-2 font-mono">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function JwksList({
  keys,
  hasError,
}: {
  keys: Array<Record<string, unknown>>;
  hasError: boolean;
}) {
  if (keys.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        {hasError
          ? "JWKS unavailable. Use the right-pane log to inspect the failed fetch."
          : "Run discovery to load JWKS."}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {keys.map((k, i) => {
        const kid = typeof k.kid === "string" ? k.kid : undefined;
        const kty = typeof k.kty === "string" ? k.kty : "?";
        const alg = typeof k.alg === "string" ? k.alg : undefined;
        const use = typeof k.use === "string" ? k.use : undefined;
        return (
          <li
            key={kid ?? i}
            className="rounded-md border border-border bg-background/40 p-3 font-mono text-[12px]"
          >
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
              {kid && (
                <span>
                  <span className="text-foreground">kid</span>: {kid}
                </span>
              )}
              <span>
                <span className="text-foreground">kty</span>: {kty}
              </span>
              {alg && (
                <span>
                  <span className="text-foreground">alg</span>: {alg}
                </span>
              )}
              {use && (
                <span>
                  <span className="text-foreground">use</span>: {use}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function collectEndpoints(meta: OidcMetadata) {
  return Object.entries(meta)
    .filter(
      ([k, v]) =>
        typeof v === "string" &&
        (k.endsWith("_endpoint") || k === "jwks_uri" || k === "issuer"),
    )
    .map(([k, v]) => ({ name: k, value: v as string }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function errorStatusFromKind(
  err: DiscoveryError,
): "cors-error" | "http-error" | "network-error" | "malformed" {
  switch (err.kind) {
    case "cors-error":
      return "cors-error";
    case "http-error":
      return "http-error";
    case "network-error":
      return "network-error";
    case "invalid-url":
      return "network-error";
    case "malformed":
      return "malformed";
  }
}

function errorMessage(err: DiscoveryError): string {
  switch (err.kind) {
    case "invalid-url":
    case "cors-error":
    case "network-error":
      return err.message;
    case "http-error":
      return `${err.status} ${err.statusText}`;
    case "malformed":
      return err.missing.join(", ");
  }
}
