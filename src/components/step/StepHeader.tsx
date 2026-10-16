import { type ReactNode } from "react";
import { getStep, type StepId } from "../../types";

export interface StepHeaderProps {
  /** Step identity — the title comes from STEPS so it always matches the rail. */
  step: StepId;
  /** Optional one-line descriptor shown next to the title (e.g. what the step
   * does). This, not a repeated zone label, is what differentiates a page. */
  titleSuffix?: ReactNode;
  /** Right-aligned slot — typically a <StatusPill /> or a plain text label. */
  right?: ReactNode;
}

// Title-led: the step name plus a short descriptor. The rail already says which
// zone you're in, so the header doesn't repeat it.
export function StepHeader({ step, titleSuffix, right }: StepHeaderProps) {
  const def = getStep(step);
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
      <h1 className="text-xl font-semibold tracking-tight">
        {def.name}
        {titleSuffix && (
          <span className="ml-2 text-[12px] font-normal text-muted-foreground">
            {titleSuffix}
          </span>
        )}
      </h1>
      {right}
    </div>
  );
}
