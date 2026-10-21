import { parseAuthorizationDetails } from "../../protocol/authorizationDetails";
import { AuthorizationDetailChips } from "./AuthorizationDetailsView";

/** scope + authorization_details come from Auth request (one source of truth);
 * this shows what a grant will carry and links back to edit them. Shared by the
 * Device, CIBA, and JWT Bearer flows, whose steps all reuse AuthRequestState.
 * Omit `rar` to hide the RAR row for a grant that doesn't carry it. */
export function GrantSummary({
  scopes,
  rar,
  onEdit,
}: {
  scopes: string[];
  rar?: { enabled: boolean; text: string };
  onEdit: () => void;
}) {
  const parsed =
    rar?.enabled && rar.text.trim()
      ? parseAuthorizationDetails(rar.text)
      : null;
  return (
    <div className="space-y-2 rounded-md border border-border bg-background/40 p-3">
      <div>
        <span className="font-mono text-[11px] text-muted-foreground">
          scope
        </span>
        <p className="font-mono text-[12.5px]">
          {scopes.length ? scopes.join(" ") : "none selected"}
        </p>
      </div>
      {rar && (
        <div>
          <span className="font-mono text-[11px] text-muted-foreground">
            authorization_details
          </span>
          {parsed?.ok ? (
            <div className="mt-1">
              <AuthorizationDetailChips details={parsed.details} />
            </div>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">
              {rar.enabled
                ? "enabled — check the JSON in Auth request"
                : "off (RAR)"}
            </p>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={onEdit}
        className="text-[11.5px] text-[var(--playground-accent)] hover:underline"
      >
        edit in Auth request →
      </button>
    </div>
  );
}
