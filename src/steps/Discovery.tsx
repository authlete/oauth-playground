import { useState, type FormEvent, type ReactNode } from "react";
import { Loader2, RotateCw, Send } from "lucide-react";
import { usePlayground } from "../store/playground";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import {
  Banner,
  StatusPill,
  StepHeader as SharedStepHeader,
} from "../components/step";
import { cn } from "../lib/cn";
import { fetchDiscovery, type DiscoveryError } from "../lib/discovery";
import { applyManual } from "../lib/manualDiscovery";
import type { ManualEndpoints, OidcMetadata } from "../types";

type Tab = "endpoints" | "jwks" | "raw";

export function DiscoveryStep() {
  const { state, discoveryUpdate, networkAdd, networkUpdate } = usePlayground();
  const discovery = state.discovery;
  const isLoading = discovery.status === "loading";

  const [tab, setTab] = useState<Tab>("endpoints");
  const [issuerInput, setIssuerInput] = useState(discovery.issuer);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    discoveryUpdate({
      status: "loading",
      issuer: issuerInput,
      errorMessage: undefined,
      errorBody: undefined,
      errorStatus: undefined,
      metadata: undefined,
      jwks: undefined,
      durationMs: undefined,
    });

    const result = await fetchDiscovery(issuerInput, {
      onStart: (entry) => networkAdd(entry),
      onFinish: (id, patch) => networkUpdate(id, patch),
    });

    if (!result.ok) {
      discoveryUpdate({
        status: errorStatusFromKind(result.error),
        errorMessage: errorMessage(result.error),
        errorBody: "body" in result.error ? result.error.body : undefined,
        errorStatus:
          "status" in result.error ? result.error.status : undefined,
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
  };

  return (
    <div className="mx-auto max-w-3xl">
      <StepHeader status={discovery.status} durationMs={discovery.durationMs} />

      <ModeTabs
        mode={discovery.mode}
        onChange={(mode) => discoveryUpdate({ mode })}
      />

      {discovery.mode === "wellknown" ? (
        <>
          <form onSubmit={onSubmit} className="mt-4 flex items-center gap-2">
            <label className="sr-only" htmlFor="issuer-input">
              Issuer URL
            </label>
            <Input
              id="issuer-input"
              mono
              value={issuerInput}
              onChange={(e) => setIssuerInput(e.target.value)}
              placeholder="https://issuer.example/"
              disabled={isLoading}
              autoComplete="off"
              spellCheck={false}
            />
            <Button type="submit" disabled={isLoading} className="shrink-0">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Fetching…
                </>
              ) : discovery.status === "success" ||
                discovery.status === "partial" ? (
                <>
                  <RotateCw className="h-4 w-4" />
                  Re-run
                </>
              ) : (
                "Run discovery"
              )}
            </Button>
          </form>

          {discovery.status === "idle" && (
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              Press Run, or paste a different issuer URL.
            </p>
          )}
        </>
      ) : (
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
        return <CorsErrorPanel message={discovery.errorMessage ?? ""} />;
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
            missing={(discovery.errorMessage ?? "").split(",").map((s) => s.trim())}
          />
        );
      case "partial":
      case "success":
        return (
          <SuccessPanel
            metadata={discovery.metadata!}
            jwks={discovery.jwks}
            jwksError={
              discovery.status === "partial" ? discovery.errorMessage : undefined
            }
            tab={tab}
            setTab={setTab}
          />
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
    <SharedStepHeader
      stepNumber={1}
      title="AS Discovery"
      right={renderPill(status, durationMs)}
    />
  );
}

function ModeTabs({
  mode,
  onChange,
}: {
  mode: "wellknown" | "manual";
  onChange: (mode: "wellknown" | "manual") => void;
}) {
  return (
    <div className="mt-4 inline-flex rounded-md border border-border bg-card p-0.5 text-[12.5px]">
      <ModeTab active={mode === "wellknown"} onClick={() => onChange("wellknown")}>
        Discovery
      </ModeTab>
      <ModeTab active={mode === "manual"} onClick={() => onChange("manual")}>
        Manual endpoints
      </ModeTab>
    </div>
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
    <div className="mt-4 space-y-3">
      <p className="text-[12.5px] text-muted-foreground">
        {prefilled
          ? "Pre-filled from the last successful Discovery — edit any endpoint to override."
          : "Use when the AS has no .well-known endpoint or you're targeting a stub/test server."}{" "}
        Required fields marked with *.
      </p>
      <ManualField
        label="issuer *"
        hint="Echoed at step 5 (RFC 9207); validated against the iss param."
      >
        <Input
          mono
          value={endpoints.issuer}
          onChange={(e) => onChange({ issuer: e.target.value })}
          placeholder="https://my-as.example.com"
        />
      </ManualField>
      <ManualField label="authorization_endpoint *">
        <Input
          mono
          value={endpoints.authorization_endpoint}
          onChange={(e) => onChange({ authorization_endpoint: e.target.value })}
          placeholder="https://my-as.example.com/authorize"
        />
      </ManualField>
      <ManualField label="token_endpoint *">
        <Input
          mono
          value={endpoints.token_endpoint}
          onChange={(e) => onChange({ token_endpoint: e.target.value })}
          placeholder="https://my-as.example.com/token"
        />
      </ManualField>
      <ManualField
        label="jwks_uri"
        hint="Optional. Fetched on Apply for step 7 signature verification."
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
          onChange={(e) => onChange({ revocation_endpoint: e.target.value })}
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
      {hint && <p className="mt-1 text-[11.5px] text-muted-foreground">{hint}</p>}
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

function CorsErrorPanel({ message: _message }: { message: string }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "the playground";
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
            The browser made the request but the AS didn't send back the{" "}
            <code className="font-mono">Access-Control-Allow-Origin</code>{" "}
            header. v0.2 of the playground will ship a relay; for now:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              Enable CORS on the target AS for{" "}
              <code className="font-mono">{origin}</code>, or
            </li>
            <li>
              Serve the playground at <code className="font-mono">/playground/*</code>{" "}
              on the same origin as the AS.
            </li>
          </ul>
        </div>
      </details>
      <p className="mt-3 text-[11.5px] text-muted-foreground">
        Why CORS? — design doc §9.
      </p>
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

function MalformedPanel({ body, missing }: { body: string; missing: string[] }) {
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
        <TabButton active={tab === "endpoints"} onClick={() => setTab("endpoints")}>
          Endpoints ({endpoints.length})
        </TabButton>
        <TabButton active={tab === "jwks"} onClick={() => setTab("jwks")}>
          JWKS ({jwks?.keys?.length ?? 0} keys)
        </TabButton>
        <TabButton active={tab === "raw"} onClick={() => setTab("raw")}>
          Raw metadata
        </TabButton>
      </div>

      <div className="mt-4">
        {tab === "endpoints" && <EndpointTable endpoints={endpoints} />}
        {tab === "jwks" && (
          <JwksList keys={jwks?.keys ?? []} hasError={!!jwksError} />
        )}
        {tab === "raw" && (
          <pre className="max-h-[480px] overflow-auto rounded-md border border-border bg-background/60 p-3 font-mono text-[12px] leading-relaxed">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        )}
      </div>
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
