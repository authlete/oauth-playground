import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, mono, ...rest }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-md border border-border bg-background px-3 text-sm",
        "placeholder:text-muted-foreground",
        "disabled:cursor-not-allowed disabled:opacity-60",
        mono && "font-mono",
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = "Input";
