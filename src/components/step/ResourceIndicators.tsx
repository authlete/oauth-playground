import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { resourceError } from "../../protocol/resourceIndicator";

export interface ResourceIndicatorsProps {
  resources: string[];
  onChange: (resources: string[]) => void;
  /** One-click chips that append a known resource — a discovered RFC 9728
   * resource, or the resources from the original grant. Already-present values
   * are hidden. */
  suggestions?: string[];
  suggestionLabel?: string;
}

/**
 * Shared editor for RFC 8707 resource indicators, used anywhere a request can
 * carry `resource` params (Auth request, Token exchange, Refresh). One row per
 * value; always shows at least one so a single resource reads as the default
 * (the spec encourages one). "Add resource" and the chips extend to several.
 */
export function ResourceIndicators({
  resources,
  onChange,
  suggestions = [],
  suggestionLabel,
}: ResourceIndicatorsProps) {
  const rows = resources.length ? resources : [""];
  const setAt = (i: number, value: string) =>
    onChange(rows.map((r, idx) => (idx === i ? value : r)));
  const removeAt = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const add = (value = "") => onChange([...resources, value]);
  const pending = suggestions.filter((s) => !resources.includes(s));

  return (
    <div className="space-y-2">
      {rows.map((value, i) => {
        const err = resourceError(value);
        return (
          <div key={i}>
            <div className="flex items-center gap-2">
              <Input
                mono
                value={value}
                onChange={(e) => setAt(i, e.target.value)}
                placeholder="https://api.example.com/"
              />
              {rows.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAt(i)}
                >
                  Remove
                </Button>
              )}
            </div>
            {err && (
              <p className="mt-1 text-[11.5px] text-[var(--status-warn)]">
                {err}
              </p>
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => add()}
        >
          Add resource
        </Button>
        {pending.length > 0 && (
          <>
            {suggestionLabel && (
              <span className="ml-1 text-[11.5px] text-muted-foreground">
                {suggestionLabel}
              </span>
            )}
            {pending.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => add(s)}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 font-mono text-[11px] hover:bg-muted"
                title="Add this resource"
              >
                + {s}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
