import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  mono?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, mono, ...rest }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed",
        "placeholder:text-muted-foreground",
        "disabled:cursor-not-allowed disabled:opacity-60",
        mono && "font-mono",
        className,
      )}
      spellCheck={false}
      autoComplete="off"
      {...rest}
    />
  ),
);
Textarea.displayName = "Textarea";
