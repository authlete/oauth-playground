import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../protocol/cn";

export interface SectionProps {
  title: string;
  /** Grey parenthetical after the title, e.g. an RFC citation. */
  hint?: string;
  /** One-line note shown in the left column when the section is open. */
  description?: ReactNode;
  /** The section's active state, shown on the right of the (clickable) header —
   * so you can read what's configured without expanding it. */
  summaryRight?: ReactNode;
  /** A small control on the right of the header (e.g. a link). Clicking it does
   * not toggle the section. */
  action?: ReactNode;
  /** Whether it starts open. Defaults to open — most sections are essentials;
   * pass false for the ones that are advanced or auto-generated. */
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

/** The app's one section primitive: a titled, collapsible group with a right-
 * side active-state summary. Open or closed by default per the section's role,
 * but always collapsible so every step reads with the same grammar.
 *
 * When open, the body uses a two-column layout at @4xl (description left,
 * controls right) so long forms chunk instead of reading as one column. */
export function Section({
  title,
  hint,
  description,
  summaryRight,
  action,
  defaultOpen = true,
  children,
  className,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className={cn(
        "rounded-lg border border-border bg-muted/20 p-4 @4xl:p-5",
        className,
      )}
    >
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3">
        <span className="text-[13px] font-semibold leading-5">
          {title}
          {hint && (
            <span className="font-normal text-muted-foreground"> {hint}</span>
          )}
        </span>
        <span className="flex items-center gap-3">
          {summaryRight && (
            <span className="font-mono text-[11px] text-muted-foreground">
              {summaryRight}
            </span>
          )}
          {action && <span onClick={(e) => e.stopPropagation()}>{action}</span>}
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              !open && "-rotate-90",
            )}
            aria-hidden
          />
        </span>
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
