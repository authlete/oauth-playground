import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "../ui/Button";
import { Section } from "./Section";
import {
  formatFormBody,
  prettyUrl,
  type PreviewBlock,
} from "../../lib/requestPreview";

/** Wire-level request preview.
 *
 * "section" (default): a full Section titled "Final request" — for standalone
 * use on the Authorize / PAR pages.
 * "plain": just the pre block, copy button, and notes — for embedding inside
 * a card that already provides section chrome (the Auth request live
 * preview), so sections never nest. */
export function RequestPreview({
  block,
  className,
  variant = "section",
}: {
  block: PreviewBlock;
  className?: string;
  variant?: "section" | "plain";
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

  const copyButton = (
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
  );

  const body = (
    <>
      <pre className="overflow-auto rounded-md border border-border bg-background/60 px-3 py-2.5 font-mono text-[11.5px] leading-relaxed">
        {text}
      </pre>
      {block.notes && block.notes.length > 0 && (
        <div className="mt-2 text-[11.5px] text-muted-foreground">
          {block.notes.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
        </div>
      )}
    </>
  );

  if (variant === "plain") {
    return (
      <div className={className}>
        {body}
        <div className="mt-3">{copyButton}</div>
      </div>
    );
  }

  return (
    <Section
      title="Final request"
      description="The exact request on the wire — method, headers, body."
      className={className}
      action={copyButton}
    >
      {body}
    </Section>
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
