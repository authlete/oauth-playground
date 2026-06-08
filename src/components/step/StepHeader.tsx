import { type ReactNode } from "react";

export interface StepHeaderProps {
  /** Sequential step number — renders as "Step 6". Omit for auxiliary steps. */
  stepNumber?: number;
  /** Override the eyebrow text entirely (e.g. "Optional"). Takes precedence over stepNumber. */
  stepLabel?: string;
  title: string;
  /** Optional badge or descriptor shown next to the title (e.g. "passive"). */
  titleSuffix?: ReactNode;
  /** Right-aligned slot — typically a <StatusPill /> or a plain text label. */
  right?: ReactNode;
}

export function StepHeader({
  stepNumber,
  stepLabel,
  title,
  titleSuffix,
  right,
}: StepHeaderProps) {
  const eyebrow = stepLabel ?? (stepNumber !== undefined ? `Step ${stepNumber}` : null);
  return (
    <div className="flex items-center justify-between border-b border-border pb-3">
      <div>
        {eyebrow && (
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {eyebrow}
          </div>
        )}
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight">
          {title}
          {titleSuffix && (
            <span className="ml-2 text-[12px] font-normal text-muted-foreground">
              {titleSuffix}
            </span>
          )}
        </h1>
      </div>
      {right}
    </div>
  );
}
