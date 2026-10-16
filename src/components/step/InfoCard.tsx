import { type ReactNode } from "react";
import { Section } from "./Section";

export interface InfoCardProps {
  /** Section-style title (e.g. "Request", "About to authorize"). */
  label: string;
  /** One-line explanation, rendered in the Section's description slot. */
  description?: ReactNode;
  /** HTTP method rendered before the URL (muted). */
  method?: string;
  /** Endpoint URL shown as the first content line, full-width and breakable. */
  url?: string;
  /** Right-side header slot (e.g. a state tag) — passed to the Section. */
  summaryRight?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Context card for "here's what this step is about to do" — a Section under
 * the hood, so it follows the same two-level layout as the form sections. */
export function InfoCard({
  label,
  description,
  method,
  url,
  summaryRight,
  children,
  className,
}: InfoCardProps) {
  return (
    <Section
      title={label}
      description={description}
      summaryRight={summaryRight}
      className={className}
    >
      <div className="space-y-3 text-[12.5px]">
        {url && (
          <p className="break-all font-mono text-[12px]">
            {method && <span className="text-muted-foreground">{method} </span>}
            {url}
          </p>
        )}
        {children}
      </div>
    </Section>
  );
}
