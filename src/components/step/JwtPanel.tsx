// Side-by-side header + payload display for a decoded JWT, plus a raw row
// with a copy button. Reused by Token Inspector (step 7) and Federation
// Register (step 2.5) — both need to show a decoded signed payload, but each
// surrounds it with different metadata (verification banner / claims row vs.
// "apply as client_id" CTA), so this stays focused on the decode itself.

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "../ui/Button";
import type { JwtParsed } from "../../lib/jwt";

export function JwtPanel({
  jwt,
  payloadSubtitle,
}: {
  jwt: JwtParsed;
  payloadSubtitle?: string;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(jwt.raw);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const headerSubtitle = `alg=${jwt.header.alg ?? "?"}${
    jwt.header.kid ? ` · kid=${jwt.header.kid}` : ""
  }`;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <JwtBlock title="Header" subtitle={headerSubtitle} json={jwt.header} />
        <JwtBlock title="Payload" subtitle={payloadSubtitle} json={jwt.payload} />
      </div>
      <div className="flex items-center gap-2 rounded-md border border-border bg-card/40 p-3 text-[12px]">
        <span className="text-muted-foreground">Raw JWT</span>
        <code className="flex-1 truncate font-mono text-[11.5px]">{jwt.raw}</code>
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
    </div>
  );
}

function JwtBlock({
  title,
  subtitle,
  json,
}: {
  title: string;
  subtitle?: string;
  json: Record<string, unknown>;
}) {
  return (
    <div className="rounded-md border border-border bg-card/40 p-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[12.5px] font-medium">{title}</h3>
        {subtitle && (
          <span className="font-mono text-[10.5px] text-muted-foreground">
            {subtitle}
          </span>
        )}
      </div>
      <pre className="mt-2 max-h-[280px] overflow-auto rounded-sm bg-background/60 p-2 font-mono text-[11.5px] leading-relaxed">
        {JSON.stringify(json, null, 2)}
      </pre>
    </div>
  );
}
