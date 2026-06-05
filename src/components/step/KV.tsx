import { type ReactNode } from "react";
import { cn } from "../../lib/cn";

/**
 * Flex-style key/value row — useful in lists where the value can grow.
 * Pair with <KVList> for vertical stacking with consistent spacing.
 */
export function KV({
  label,
  children,
  labelWidth = "w-32",
}: {
  label: string;
  children: ReactNode;
  labelWidth?: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt
        className={cn(
          "shrink-0 text-[11.5px] uppercase tracking-wide text-muted-foreground",
          labelWidth,
        )}
      >
        {label}
      </dt>
      <dd className="flex-1 min-w-0 text-[13px]">{children}</dd>
    </div>
  );
}

export function KVList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <dl className={cn("space-y-1.5", className)}>{children}</dl>;
}

/**
 * Grid-style key/value pair for dense "Will POST to" panels. Each call to
 * <KVRow> emits a bare <dt> + <dd> so the parent <KVGrid>'s two-column grid
 * lays them out aligned across all rows.
 */
export function KVGrid({
  children,
  className,
  labelWidth = "120px",
}: {
  children: ReactNode;
  className?: string;
  labelWidth?: string;
}) {
  return (
    <dl
      className={cn("grid gap-x-3 gap-y-1 text-[12.5px]", className)}
      style={{ gridTemplateColumns: `${labelWidth} 1fr` }}
    >
      {children}
    </dl>
  );
}

export function KVRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      <dt className="text-[11.5px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-[13px] font-mono break-all">{children}</dd>
    </>
  );
}
