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
 * "page" and "field" so long forms chunk instead of reading as one column. */
export function Section({ title, description, action, children, className }: SectionProps) {
  return (
    <section
      className={cn("rounded-lg border border-border bg-muted/20 p-4", className)}
    >
      <div className={cn("flex items-start justify-between gap-3", "mb-4")}>
        <div>
          <h2 className="text-[13px] font-semibold leading-5">{title}</h2>
          {description && (
            <p className="mt-0.5 text-[12px] text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
