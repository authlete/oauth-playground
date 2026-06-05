import { useState, type ReactNode } from "react";
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
  StatusPill,
  StepHeader,
  type StatusTone,
} from "../components/step";
import { shorten } from "../lib/format";
import { cn } from "../lib/cn";
import { resourceCall } from "../lib/resourceCall";
import type { HttpMethod } from "../types";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];

export function ResourceStep() {
  const {
    state,
    resourceCallUpdate,
    networkAdd,
    networkUpdate,
    setStepStatus,
  } = usePlayground();
  const rc = state.resourceCall;
  const [copied, setCopied] = useState(false);

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
    <div className="mx-auto max-w-3xl">
      <StepHeader stepNumber={10} title="Resource call" right={renderPill(rc.status)} />

      <div className="mt-5 space-y-4">
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
            onChange={(e) => resourceCallUpdate({ headersText: e.target.value })}
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
              onChange={(e) => resourceCallUpdate({ bodyText: e.target.value })}
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
          onChange={(e) => resourceCallUpdate({ attachBearer: e.target.checked })}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {rc.status === "loading" ? (
          <Button disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
            Calling…
          </Button>
        ) : rc.status === "success" ? (
          <Button variant="secondary" onClick={onCall} disabled={!rc.url.trim()}>
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
          Bearer not attached — the resource server will likely return 401 unless
          it accepts unauthenticated calls.
        </p>
      )}

      {rc.status === "success" && rc.response && (
        <ResponsePanel response={rc.response} onCopyBody={onCopyBody} copied={copied} />
      )}
      {rc.status === "error" && (
        <ErrorPanel className="mt-4" message={rc.errorMessage ?? "Unknown error."} />
      )}
    </div>
  );
}

function ResponsePanel({
  response,
  onCopyBody,
  copied,
}: {
  response: NonNullable<ReturnType<typeof usePlayground>["state"]["resourceCall"]["response"]>;
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
            is2xx ? "text-[var(--status-success)]" : "text-[var(--status-warn)]",
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
      {hint && <p className="mt-1.5 text-[12px] text-muted-foreground">{hint}</p>}
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
  const map: Record<Exclude<typeof status, "idle">, { tone: StatusTone; label: string; spinning?: boolean }> = {
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
