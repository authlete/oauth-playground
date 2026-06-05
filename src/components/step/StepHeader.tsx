import { type ReactNode } from "react";

export interface StepHeaderProps {
  stepNumber: number;
  title: string;
  /** Optional badge or descriptor shown next to the title (e.g. "passive"). */
  titleSuffix?: ReactNode;
  /** Right-aligned slot — typically a <StatusPill /> or a plain text label. */
  right?: ReactNode;
}

export function StepHeader({
  stepNumber,
  title,
  titleSuffix,
  right,
}: StepHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-3">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Step {stepNumber}
        </div>
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
