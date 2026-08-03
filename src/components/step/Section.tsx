import { type ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface SectionProps {
  title: string;
  /** One-line explanation under the title — prefer this over per-field hints
   * when the note applies to the group as a whole. */
  description?: ReactNode;
  /** Right-aligned header slot (toggle, status, small action). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Titled, bordered group for step forms. Gives pages a section level between
 * "page" and "field" so long forms chunk instead of reading as one column.
 *
 * Layout adapts to the center pane (container query, not viewport): stacked
 * title-above-controls normally, console-style two-column (title/description
 * left, controls right) once the pane is @4xl or wider. */
export function Section({
  title,
  description,
  action,
  children,
  className,
}: SectionProps) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-muted/20 p-4 @4xl:p-5",
        className,
      )}
    >
      <div className="@4xl:grid @4xl:grid-cols-[220px_1fr] @4xl:gap-8">
        <div className="mb-4 flex items-start justify-between gap-3 @4xl:mb-0 @4xl:block">
          <div>
            <h2 className="text-[13px] font-semibold leading-5">{title}</h2>
            {description && (
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {action && <div className="@4xl:mt-3">{action}</div>}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}
