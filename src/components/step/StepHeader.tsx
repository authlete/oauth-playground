import { type ReactNode } from "react";
import { getStep, type StepId } from "../../types";

export interface StepHeaderProps {
  /** Step identity — number, name, and eyebrow all come from STEPS so the
   * page header always matches the rail. */
  step: StepId;
  /** Override the eyebrow text (e.g. "Optional"). Nested steps default to
   * "Optional"; numbered steps to "Step N". */
  stepLabel?: string;
  /** Optional badge or descriptor shown next to the title (e.g. "passive"). */
  titleSuffix?: ReactNode;
  /** Right-aligned slot — typically a <StatusPill /> or a plain text label. */
  right?: ReactNode;
}

export function StepHeader({ step, stepLabel, titleSuffix, right }: StepHeaderProps) {
  const def = getStep(step);
  const eyebrow =
    stepLabel ?? (def.number !== undefined ? `Step ${def.number}` : "Optional");
  return (
    <div className="flex items-center justify-between border-b border-border pb-3">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {eyebrow}
        </div>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight">
          {def.name}
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
