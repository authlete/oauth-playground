import { useState, type ReactNode } from "react";

export interface DisclosureProps {
  title: string;
  /** Parenthetical shown muted after the title, e.g. an RFC citation. */
  hint?: string;
  /** Left-column note when open — mirrors Section's two-level grammar. */
  description?: ReactNode;
  /** Right-aligned status in the summary (count, action) so an active but
   * collapsed section still signals its state without being expanded. */
  summaryRight?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** Collapsible counterpart to Section for optional / rarely-touched params.
 * Keeps the default view short without carrying permanent visual weight.
 * Same chrome as Section so the two read as one grammar. */
export function Disclosure({
  title,
  hint,
  description,
  summaryRight,
  defaultOpen = false,
  children,
}: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-lg border border-border bg-muted/20 p-4 text-[13px] @4xl:px-5"
    >
      <summary className="flex cursor-pointer select-none items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold leading-5">
          {title}
          {hint && (
            <span className="font-normal text-muted-foreground"> {hint}</span>
          )}
        </span>
        {summaryRight && (
          <span className="font-mono text-[11px] text-muted-foreground">
            {summaryRight}
          </span>
        )}
      </summary>
      <div className="mt-4 @4xl:grid @4xl:grid-cols-[220px_1fr] @4xl:gap-8">
        {description ? (
          <p className="mb-4 text-[12px] leading-relaxed text-muted-foreground @4xl:mb-0">
            {description}
          </p>
        ) : (
          <div className="hidden @4xl:block" />
        )}
        <div className="min-w-0">{children}</div>
      </div>
    </details>
  );
}
