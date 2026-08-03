import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Check, Copy, Loader2, RotateCw } from "lucide-react";
import { usePlayground } from "../store/playground";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import { Checkbox } from "../components/ui/Checkbox";
import {
  Banner,
  ErrorPanel,
  Section,
  StatusPill,
  StepHeader,
  type StatusTone,
} from "../components/step";
import { shorten } from "../lib/format";
import { cn } from "../lib/cn";
import { resourceCall } from "../lib/resourceCall";
import { parseBearerChallenge } from "../lib/bearerChallenge";
import type { HttpMethod } from "../types";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];

export function ResourceStep() {
  const {
    state,
    resourceCallUpdate,
    authRequestUpdate,
    setActiveStep,
    networkAdd,
    networkUpdate,
    setStepStatus,
  } = usePlayground();
  const rc = state.resourceCall;
  const [copied, setCopied] = useState(false);

  // When the flow started at a protected resource, prefill the target with
  // its base URL (RFC 9728 doesn't advertise endpoints, so just the origin).
  const prm =
    state.resource.status === "success" ? state.resource.prm : undefined;
  const prmResource = prm?.resource;
  // The resource's advertised scopes vs what the token was actually granted —
  // drives the proactive step-up affordances in the Access section.
  const prmScopes = prm?.scopes_supported ?? [];
  const operations = prm ? state.resource.operations : undefined;
  const grantedScopes = (state.token.scope ?? "").split(/\s+/).filter(Boolean);
  useEffect(() => {
    if (!rc.url && prmResource) {
      resourceCallUpdate({ url: `${prmResource}/` });
    }
  }, [rc.url, prmResource, resourceCallUpdate]);

  // Step-up: add the scope the RS demanded and jump back into authorization.
  const stepUpScope = (scope: string) => {
    const scopes = state.authRequest.scopes.includes(scope)
      ? state.authRequest.scopes
      : [...state.authRequest.scopes, scope];
    authRequestUpdate({ scopes });
    setActiveStep(state.par.enabled ? "par" : "authorize");
  };

  const onCall = async () => {
    resourceCallUpdate({
      status: "loading",
      response: undefined,
      errorMessage: undefined,
    });
    const result = await resourceCall({
      url: rc.url,
      method: rc.method as HttpMethod,
      headersText: rc.headersText,
      bodyText: rc.bodyText,
      attachBearer: rc.attachBearer,
      accessToken: state.token.accessToken,
      onStart: networkAdd,
      onFinish: networkUpdate,
    });
    if (result.ok) {
      resourceCallUpdate({
        status: "success",
        response: {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers,
          body: result.body,
          durationMs: result.durationMs,
        },
      });
      setStepStatus("resource", "done");
    } else {
      resourceCallUpdate({
        status: "error",
        errorMessage: result.message,
      });
    }
  };

  const onCopyBody = async () => {
    if (!rc.response?.body) return;
    try {
      await navigator.clipboard.writeText(rc.response.body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const hasBearer = rc.attachBearer && !!state.token.accessToken;

  return (
    <div className="mx-auto max-w-3xl @4xl:max-w-5xl">
      <StepHeader step="resource" right={renderPill(rc.status)} />

      <div className="mt-5 space-y-4">
        {operations && operations.length > 0 ? (
          <Section
            title="Operations"
            description="What the API exposes, from its OpenAPI document — pick one to fill the request."
          >
            <div className="divide-y divide-border/60">
              {operations.map((op) => {
                const missing = op.scopes.filter(
                  (s) => !grantedScopes.includes(s),
                );
                return (
                  <div
                    key={`${op.method} ${op.path}`}
                    className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
                  >
                    <span className="w-14 shrink-0 font-mono text-[11px] font-bold">
                      {op.method}
                    </span>
                    <code className="shrink-0 font-mono text-[12px]">
                      {op.path}
                    </code>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                      {op.summary}
                    </span>
                    {op.scopes.map((scope) => (
                      <ScopeChip
                        key={scope}
                        scope={scope}
                        granted={grantedScopes.includes(scope)}
                        onStepUp={stepUpScope}
                      />
                    ))}
                    <Button
                      size="sm"
                      variant="secondary"
                      className="shrink-0"
                      title={
                        missing.length > 0
                          ? "Fills the request — the call will get an insufficient-scope challenge until you step up"
                          : undefined
                      }
                      onClick={() =>
                        resourceCallUpdate({
                          method: op.method,
                          url: `${prmResource ?? ""}${op.filledPath}`,
                          bodyText: op.requestBodyExample ?? rc.bodyText,
                        })
                      }
                    >
                      Use →
                    </Button>
                  </div>
                );
              })}
            </div>
          </Section>
        ) : prmScopes.length > 0 ? (
          <Section
            title="Access"
            description="The resource's scopes vs what your token was granted — step up before the API has to refuse you."
          >
            <div className="flex flex-wrap items-center gap-2">
              {prmScopes.map((scope) => (
                <ScopeChip
                  key={scope}
                  scope={scope}
                  granted={grantedScopes.includes(scope)}
                  onStepUp={stepUpScope}
                />
              ))}
            </div>
            {state.token.scope === undefined && (
              <p className="mt-2 text-[12px] text-muted-foreground">
                The AS didn't echo a <code className="font-mono">scope</code> in
                the token response — granted scopes are unknown until a call or
                an introspection reveals them.
              </p>
            )}
          </Section>
        ) : null}

        <Section
          title="Request"
          description="Hits your own resource server; the playground only adds the Bearer header."
          action={
            typeof prm?.resource_documentation === "string" ? (
              <a
                href={prm.resource_documentation}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] text-[var(--playground-accent)] hover:underline"
              >
                API reference ↗
              </a>
            ) : undefined
          }
        >
          <div className="space-y-4">
            <div className="flex gap-2">
              <Select
                value={rc.method}
                onChange={(e) => resourceCallUpdate({ method: e.target.value })}
                className="w-28 shrink-0"
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
              <Input
                mono
                value={rc.url}
                onChange={(e) => resourceCallUpdate({ url: e.target.value })}
                placeholder="https://api.example.com/me"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <Field
              label="Headers (JSON object, optional)"
              hint='e.g. {"Accept":"application/json","X-Trace-Id":"abc"}'
            >
              <Textarea
                mono
                rows={3}
                value={rc.headersText}
                onChange={(e) =>
                  resourceCallUpdate({ headersText: e.target.value })
                }
                placeholder="{}"
                className="resize-y"
              />
            </Field>

            {rc.method !== "GET" && rc.method !== "HEAD" && (
              <Field
                label="Body (JSON or form-encoded)"
                hint="Content-Type auto-detected if not in headers."
              >
                <Textarea
                  mono
                  rows={4}
                  value={rc.bodyText}
                  onChange={(e) =>
                    resourceCallUpdate({ bodyText: e.target.value })
                  }
                  className="resize-y"
                />
              </Field>
            )}

            <Checkbox
              label={
                state.token.accessToken
                  ? `Attach Bearer ${shorten(state.token.accessToken, 10, 6)}`
                  : "Attach Bearer (no access token available)"
              }
              checked={rc.attachBearer}
              disabled={!state.token.accessToken}
              onChange={(e) =>
                resourceCallUpdate({ attachBearer: e.target.checked })
              }
            />
          </div>
        </Section>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {rc.status === "loading" ? (
          <Button disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
            Calling…
          </Button>
        ) : rc.status === "success" ? (
          <Button
            variant="secondary"
            onClick={onCall}
            disabled={!rc.url.trim()}
          >
            <RotateCw className="h-4 w-4" />
            Re-call
          </Button>
        ) : (
          <Button onClick={onCall} disabled={!rc.url.trim()}>
            <ArrowRight className="h-4 w-4" />
            Call resource →
          </Button>
        )}
      </div>

      {!hasBearer && rc.attachBearer === false && state.token.accessToken && (
        <p className="mt-3 text-[11.5px] text-muted-foreground">
          Bearer not attached — the resource server will likely return 401
          unless it accepts unauthenticated calls.
        </p>
      )}

      {rc.status === "success" && rc.response && (
        <>
          <ChallengeGuide
            response={rc.response}
            onStepUp={stepUpScope}
            onGoRefresh={() => setActiveStep("refresh")}
            onGoToken={() => setActiveStep("token")}
          />
          <ResponsePanel
            response={rc.response}
            onCopyBody={onCopyBody}
            copied={copied}
          />
        </>
      )}
      {rc.status === "error" && (
        <ErrorPanel
          className="mt-4"
          message={rc.errorMessage ?? "Unknown error."}
        />
      )}
    </div>
  );
}

// A scope the resource accepts: green check when the token has it, amber
// step-up button (re-authorize with it added) when it doesn't.
function ScopeChip({
  scope,
  granted,
  onStepUp,
}: {
  scope: string;
  granted: boolean;
  onStepUp: (scope: string) => void;
}) {
  if (granted) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--status-success)]/40 bg-[color-mix(in_oklch,var(--status-success)_8%,transparent)] px-2 py-0.5 font-mono text-[11px]">
        <Check className="h-3 w-3 text-[var(--status-success)]" />
        {scope}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onStepUp(scope)}
      title={`Re-authorize with ${scope} added`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--status-warn)]/50 bg-[color-mix(in_oklch,var(--status-warn)_8%,transparent)] px-2 py-0.5 font-mono text-[11px] transition-colors hover:border-[var(--status-warn)]"
    >
      {scope} →
    </button>
  );
}

// Interprets RFC 6750 WWW-Authenticate challenges on 401/403 so the wire
// error becomes an actionable next step (refresh, re-exchange, or the
// incremental-consent scope step-up).
function ChallengeGuide({
  response,
  onStepUp,
  onGoRefresh,
  onGoToken,
}: {
  response: NonNullable<
    ReturnType<typeof usePlayground>["state"]["resourceCall"]["response"]
  >;
  onStepUp: (scope: string) => void;
  onGoRefresh: () => void;
  onGoToken: () => void;
}) {
  if (response.status !== 401 && response.status !== 403) return null;
  const challenge = parseBearerChallenge(response.headers["www-authenticate"]);
  if (!challenge) return null;
  const { error, error_description, scope, resource_metadata } =
    challenge.params;

  if (error === "insufficient_scope" && scope) {
    return (
      <Banner tone="warn" className="mt-4 p-4">
        <p className="text-[13.5px] font-medium">
          The resource requires scope <code className="font-mono">{scope}</code>{" "}
          — your token doesn't have it.
        </p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Re-authorize with the scope added, exchange the new code, then retry
          this call.
        </p>
        <Button size="sm" className="mt-3" onClick={() => onStepUp(scope)}>
          Add <code className="font-mono">{scope}</code> and re-authorize →
        </Button>
      </Banner>
    );
  }

  if (error === "invalid_token") {
    return (
      <Banner tone="warn" className="mt-4 p-4">
        <p className="text-[13.5px] font-medium">
          The resource rejected the token: invalid, expired, or revoked.
        </p>
        {error_description && (
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {error_description}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onGoRefresh}>
            Go to Refresh →
          </Button>
          <Button size="sm" variant="secondary" onClick={onGoToken}>
            Go to Token exchange →
          </Button>
        </div>
      </Banner>
    );
  }

  return (
    <Banner tone="info" className="mt-4 p-4">
      <p className="text-[13.5px] font-medium">
        The resource requires authentication.
      </p>
      {resource_metadata && (
        <p className="mt-1 break-all text-[12.5px] text-muted-foreground">
          Its challenge points at{" "}
          <code className="font-mono">{resource_metadata}</code> (RFC 9728) —
          run "From resource" discovery on step 1 to start the flow there.
        </p>
      )}
    </Banner>
  );
}

function ResponsePanel({
  response,
  onCopyBody,
  copied,
}: {
  response: NonNullable<
    ReturnType<typeof usePlayground>["state"]["resourceCall"]["response"]
  >;
  onCopyBody: () => void;
  copied: boolean;
}) {
  const is2xx = response.status >= 200 && response.status < 300;
  return (
    <Banner tone={is2xx ? "success" : "warn"} className="mt-4 space-y-3 p-4">
      <div className="flex items-center gap-2 text-[13.5px] font-medium">
        <span
          className={cn(
            "font-mono",
            is2xx
              ? "text-[var(--status-success)]"
              : "text-[var(--status-warn)]",
          )}
        >
          {response.status} {response.statusText}
        </span>
        <span className="text-[11.5px] text-muted-foreground">
          · {response.durationMs}ms
        </span>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onCopyBody}>
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copy body
            </>
          )}
        </Button>
      </div>
      <div>
        <div className="mb-1 text-[10.5px] uppercase tracking-wide text-muted-foreground">
          Response headers
        </div>
        <pre className="max-h-[160px] overflow-auto rounded-sm bg-background/60 p-2 font-mono text-[11.5px] leading-relaxed">
          {Object.entries(response.headers)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n") || "(none)"}
        </pre>
      </div>
      <div>
        <div className="mb-1 text-[10.5px] uppercase tracking-wide text-muted-foreground">
          Body
        </div>
        <pre className="max-h-[320px] overflow-auto rounded-sm bg-background/60 p-2 font-mono text-[11.5px] leading-relaxed">
          {prettyJsonOrText(response.body)}
        </pre>
      </div>
    </Banner>
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

function prettyJsonOrText(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      // fall through
    }
  }
  return s;
}

function renderPill(status: "idle" | "loading" | "success" | "error") {
  if (status === "idle") return null;
  const map: Record<
    Exclude<typeof status, "idle">,
    { tone: StatusTone; label: string; spinning?: boolean }
  > = {
    loading: { tone: "muted", label: "calling", spinning: true },
    success: { tone: "success", label: "responded" },
    error: { tone: "error", label: "failed" },
  };
  const p = map[status];
  return (
    <StatusPill tone={p.tone} spinning={p.spinning}>
      {p.label}
    </StatusPill>
  );
}
