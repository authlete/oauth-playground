import { useState } from "react";
import { Trash2 } from "lucide-react";
import { usePlayground } from "../store/playground";
import { Button } from "./ui/Button";
import { cn } from "../lib/cn";
import type { HttpMethod, NetworkEntry } from "../types";

const METHOD_COLOR: Record<HttpMethod, string> = {
  GET: "var(--method-get)",
  POST: "var(--method-post)",
  PUT: "var(--method-put)",
  DELETE: "var(--method-delete)",
  PATCH: "var(--method-put)",
  HEAD: "var(--method-get)",
};

export function NetworkLog() {
  const { state, networkClear } = usePlayground();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <aside
      aria-label="Network log"
      className="flex h-full w-[380px] shrink-0 flex-col border-l border-border bg-card"
    >
      <div className="flex h-10 items-center justify-between border-b border-border px-3">
        <h2 className="text-[13px] font-medium">
          Network
          <span className="ml-1.5 text-muted-foreground">
            · {state.network.length} {state.network.length === 1 ? "call" : "calls"}
          </span>
        </h2>
        {state.network.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Clear network log"
            title="Clear (⌘L)"
            onClick={networkClear}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {state.network.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {state.network.map((entry) => (
            <NetworkRow
              key={entry.id}
              entry={entry}
              expanded={expandedId === entry.id}
              onToggle={() =>
                setExpandedId((cur) => (cur === entry.id ? null : entry.id))
              }
            />
          ))}
        </ul>
      )}
    </aside>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <p className="text-center text-[13px] text-muted-foreground">
        No requests yet — run a step to see traffic.
      </p>
    </div>
  );
}

function NetworkRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: NetworkEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const pending = entry.status === undefined && entry.errorMessage === undefined;
  const failed = entry.errorMessage !== undefined;
  const path = (() => {
    try {
      const u = new URL(entry.url);
      return `${u.pathname}${u.search}`;
    } catch {
      return entry.url;
    }
  })();

  return (
    <li className="border-b border-border/60">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          "relative flex h-9 w-full items-center gap-2 px-3 text-left transition-colors",
          "hover:bg-accent/60",
          expanded && "bg-accent/40",
        )}
      >
        {expanded && (
          <span
            className="absolute inset-y-1 left-0 w-[2px] bg-[var(--playground-accent)]"
            aria-hidden
          />
        )}
        <span
          className="inline-flex h-5 w-[42px] shrink-0 items-center justify-center rounded-sm font-mono text-[10px] font-bold uppercase tracking-wide"
          style={{
            color: METHOD_COLOR[entry.method],
            backgroundColor: `color-mix(in oklch, ${METHOD_COLOR[entry.method]} 18%, transparent)`,
          }}
        >
          {entry.method}
        </span>
        <span className="flex-1 truncate font-mono text-[12.5px]" title={entry.url}>
          {path}
        </span>
        <span
          className={cn(
            "font-mono text-[11px]",
            pending && "text-muted-foreground",
            failed && "text-[var(--status-error)]",
            !pending &&
              !failed &&
              entry.status &&
              entry.status >= 200 &&
              entry.status < 300 &&
              "text-[var(--status-success)]",
            !pending &&
              !failed &&
              entry.status &&
              entry.status >= 400 &&
              "text-[var(--status-warn)]",
          )}
        >
          {pending ? "…" : failed ? "ERR" : entry.status}
        </span>
        <span className="w-12 text-right font-mono text-[10.5px] text-muted-foreground">
          {entry.durationMs !== undefined ? `${entry.durationMs}ms` : ""}
        </span>
      </button>
      {expanded && <NetworkRowDetail entry={entry} />}
    </li>
  );
}

function NetworkRowDetail({ entry }: { entry: NetworkEntry }) {
  return (
    <div className="space-y-2 border-t border-border/60 bg-background/60 p-3 text-[12px]">
      <DetailBlock label="URL" value={entry.url} mono />
      {entry.errorMessage && (
        <DetailBlock label="Error" value={entry.errorMessage} mono />
      )}
      {entry.responseHeaders && (
        <DetailBlock
          label="Response headers"
          value={Object.entries(entry.responseHeaders)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n")}
          mono
          pre
        />
      )}
      {entry.responseBody && (
        <DetailBlock
          label="Response body"
          value={truncate(entry.responseBody, 4000)}
          mono
          pre
        />
      )}
    </div>
  );
}

function DetailBlock({
  label,
  value,
  mono,
  pre,
}: {
  label: string;
  value: string;
  mono?: boolean;
  pre?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 text-[10.5px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "rounded-sm bg-muted/40 p-2 leading-relaxed",
          mono && "font-mono",
          pre ? "whitespace-pre-wrap break-all" : "break-all",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n)}\n…[truncated, ${s.length - n} bytes more]` : s;
}
