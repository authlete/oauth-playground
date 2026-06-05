import { useEffect, useRef, useState } from "react";
import { Moon, Sun, HelpCircle, X } from "lucide-react";
import { usePlayground } from "../store/playground";
import { Button } from "./ui/Button";
import { cn } from "../lib/cn";

export function TopBar() {
  const { state, toggleTheme, setActiveStep } = usePlayground();
  const [helpOpen, setHelpOpen] = useState(false);
  const issuerHost = (() => {
    try {
      return state.discovery.metadata
        ? new URL(state.discovery.metadata.issuer).host
        : null;
    } catch {
      return null;
    }
  })();

  return (
    <header className="flex h-12 shrink-0 items-center border-b border-border bg-card px-3">
      <div className="flex items-center gap-2.5">
        <BrandSquare />
        <span className="text-[15px] font-medium tracking-tight">
          Playground
        </span>
      </div>

      {issuerHost && (
        <div className="ml-6 flex items-center gap-2">
          <ContextPill
            label="AS"
            value={issuerHost}
            onClick={() => setActiveStep("discovery")}
          />
          {state.stepStatus.client === "done" && state.client.clientId && (
            <ContextPill
              label="Client"
              value={state.client.clientId}
              onClick={() => setActiveStep("client")}
            />
          )}
        </div>
      )}

      <div className="flex-1" />

      <div className="relative flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          title="Toggle theme (⌘D)"
          onClick={toggleTheme}
        >
          {state.theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Help and keyboard shortcuts"
          title="Help (?)"
          onClick={() => setHelpOpen((o) => !o)}
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
        {helpOpen && <HelpPopover onClose={() => setHelpOpen(false)} />}
      </div>
    </header>
  );
}

function HelpPopover({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Keyboard shortcuts"
      className="absolute right-0 top-10 z-50 w-72 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-lg"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[12.5px] font-medium">Keyboard shortcuts</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <dl className="space-y-1.5 text-[12px]">
        <Shortcut keys="⌘D" desc="Toggle dark / light theme" />
        <Shortcut keys="⌘L" desc="Clear network log" />
        <Shortcut keys="?" desc="Open / close this help" />
      </dl>
      <div className="mt-3 border-t border-border pt-2 text-[11px] text-muted-foreground">
        Step state stays in this tab. Tokens and keys are in-memory only —
        never persisted, never sent anywhere except the AS you targeted.
      </div>
    </div>
  );
}

function Shortcut({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-foreground">{desc}</dt>
      <dd>
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
          {keys}
        </kbd>
      </dd>
    </div>
  );
}

function BrandSquare() {
  return (
    <div
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md",
        "bg-[var(--playground-accent)] text-[var(--playground-accent-foreground)]",
        "font-bold text-base shadow-sm",
      )}
      aria-hidden
    >
      A
    </div>
  );
}

function ContextPill({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1",
        "text-[12px] hover:bg-accent transition-colors",
      )}
    >
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-mono">{value}</span>
    </button>
  );
}
