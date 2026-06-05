import { forwardRef, type InputHTMLAttributes } from "react";
import { Check } from "lucide-react";
import { cn } from "../../lib/cn";

interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className, checked, disabled, ...rest }, ref) => (
    <label
      className={cn(
        "inline-flex cursor-pointer select-none items-center gap-2 text-[13px]",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          className={cn(
            "peer absolute inset-0 cursor-inherit appearance-none rounded-sm border border-input bg-background transition-colors",
            "checked:border-primary checked:bg-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
          {...rest}
        />
        {checked && (
          <Check
            className="pointer-events-none relative z-10 h-3 w-3 text-[var(--playground-accent-foreground)]"
            strokeWidth={3}
            aria-hidden
          />
        )}
      </span>
      {label && <span>{label}</span>}
    </label>
  ),
);
Checkbox.displayName = "Checkbox";
