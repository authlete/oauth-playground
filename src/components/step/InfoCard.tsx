import { type ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface InfoCardProps {
  /** Small uppercase label shown at the top. */
  label?: string;
  /** Optional monospace URL shown below the label. */
  url?: string;
  children?: ReactNode;
  className?: string;
}

export function InfoCard({ label, url, children, className }: InfoCardProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card/40 p-3 text-[12px]",
        className,
      )}
    >
      {label && (
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      )}
      {url && <p className="mt-1 break-all font-mono">{url}</p>}
      {children && <div className={cn(label || url ? "mt-2" : "")}>{children}</div>}
    </div>
  );
}
