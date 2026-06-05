import { type ReactNode } from "react";
import { cn } from "../../lib/cn";

export type BannerTone = "info" | "warn" | "error" | "success";

const TONE_CLASS: Record<BannerTone, string> = {
  info: "border-border bg-muted/30",
  success:
    "border-[var(--status-success)]/40 bg-[color-mix(in_oklch,var(--status-success)_6%,transparent)]",
  warn:
    "border-[var(--status-warn)]/40 bg-[color-mix(in_oklch,var(--status-warn)_8%,transparent)]",
  error:
    "border-[var(--status-error)]/40 bg-[color-mix(in_oklch,var(--status-error)_8%,transparent)]",
};

export interface BannerProps {
  tone: BannerTone;
  children: ReactNode;
  className?: string;
}

export function Banner({ tone, children, className }: BannerProps) {
  return (
    <div
      className={cn(
        "rounded-md border p-3 text-[13px]",
        TONE_CLASS[tone],
        className,
      )}
      role={tone === "error" || tone === "warn" ? "alert" : undefined}
    >
      {children}
    </div>
  );
}
