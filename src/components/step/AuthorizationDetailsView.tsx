// Presentational helpers for RAR `authorization_details`: a plain-language
// chip per entry (type + a few recognizable fields) and an optional
// pretty-printed JSON block. Shared by the Auth request editor (summary of
// what you're about to send) and the Token step (requested vs. granted).

import { summarizeDetail } from "../../protocol/authorizationDetails";

type Detail = Record<string, unknown>;

export function AuthorizationDetailChips({ details }: { details: Detail[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {details.map((d, i) => {
        const parts = summarizeDetail(d);
        return (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11.5px]"
          >
            <span className="font-mono font-medium">
              {typeof d.type === "string" ? d.type : "?"}
            </span>
            {parts.length > 0 && (
              <span className="text-muted-foreground">{parts.join(" · ")}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

export function AuthorizationDetailsBlock({ details }: { details: Detail[] }) {
  return (
    <div className="space-y-2">
      <AuthorizationDetailChips details={details} />
      <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-background/60 p-3 font-mono text-[11.5px] leading-relaxed">
        {JSON.stringify(details, null, 2)}
      </pre>
    </div>
  );
}
