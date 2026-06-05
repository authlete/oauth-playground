import { type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  CircleAlert,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../lib/cn";

export type StatusTone = "muted" | "success" | "warn" | "error";

const TONE_CLASS: Record<StatusTone, string> = {
  muted: "bg-muted text-muted-foreground",
  success:
    "bg-[color-mix(in_oklch,var(--status-success)_18%,transparent)] text-[var(--status-success)]",
  warn:
    "bg-[color-mix(in_oklch,var(--status-warn)_18%,transparent)] text-[var(--status-warn)]",
  error:
    "bg-[color-mix(in_oklch,var(--status-error)_18%,transparent)] text-[var(--status-error)]",
};

const DEFAULT_ICON: Record<StatusTone, LucideIcon> = {
  muted: Loader2,
  success: Check,
  warn: AlertTriangle,
  error: CircleAlert,
};

export interface StatusPillProps {
  tone: StatusTone;
  icon?: LucideIcon;
  /** Spinner when true overrides the default icon. */
  spinning?: boolean;
  children: ReactNode;
  className?: string;
}

export function StatusPill({
  tone,
  icon,
  spinning,
  children,
  className,
}: StatusPillProps) {
  const Icon = spinning ? Loader2 : (icon ?? DEFAULT_ICON[tone]);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px]",
        TONE_CLASS[tone],
        className,
      )}
    >
      <Icon className={cn("h-3 w-3", spinning && "animate-spin")} aria-hidden />
      {children}
    </span>
  );
}
