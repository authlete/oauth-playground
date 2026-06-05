import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "../ui/Button";
import { formatFormBody, prettyUrl, type PreviewBlock } from "../../lib/requestPreview";
import { cn } from "../../lib/cn";

export function RequestPreview({
  block,
  className,
}: {
  block: PreviewBlock;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const text = renderPreview(block);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card/40 text-[12px]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Final request
        </span>
        <Button variant="ghost" size="sm" onClick={onCopy}>
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copy
            </>
          )}
        </Button>
      </div>
      <pre className="overflow-auto px-3 py-2.5 font-mono text-[11.5px] leading-relaxed">
        {text}
      </pre>
      {block.notes && block.notes.length > 0 && (
        <div className="border-t border-border/60 px-3 py-2 text-[11.5px] text-muted-foreground">
          {block.notes.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function renderPreview(block: PreviewBlock): string {
  const lines: string[] = [];
  if (block.method === "GET") {
    lines.push(`${block.method} ${prettyUrl(block.url)}`);
  } else {
    lines.push(`${block.method} ${block.url}`);
  }
  for (const [k, v] of block.headers) {
    lines.push(`${k}: ${v}`);
  }
  if (block.body) {
    lines.push("");
    lines.push(formatFormBody(block.body));
  }
  return lines.join("\n");
}
