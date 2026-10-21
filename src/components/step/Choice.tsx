import { cn } from "../../protocol/cn";

/** One-of-the-other selector — segmented pills. The app's single-select control
 * (checkboxes would wrongly imply multi-select). */
export function Choice<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: ReadonlyArray<{ id: T; label: string }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={
            value === o.id
              ? "rounded-md border border-[var(--playground-accent)] bg-[color-mix(in_oklch,var(--playground-accent)_10%,transparent)] px-3 py-1.5 text-[12.5px] font-medium"
              : "rounded-md border border-border bg-card/40 px-3 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
