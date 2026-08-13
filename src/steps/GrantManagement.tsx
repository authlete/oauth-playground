// Grant Management API step: read (GET) or revoke (DELETE) the grant the
// current access token is bound to. Contextual — only on the rail when the AS
// advertises grant_management_endpoint. Generic on grant contents (scopes,
// claims, authorization_details) so it works for scope-only grants too.

import { ArrowRight, Check, Loader2, Trash2, XCircle } from "lucide-react";
import { usePlayground } from "../store/playground";
import { Button } from "../components/ui/Button";
import {
  AuthorizationDetailsBlock,
  Banner,
  ErrorPanel,
  InfoCard,
  StatusPill,
  StepHeader,
  type StatusTone,
} from "../components/step";
import { queryGrant, revokeGrant } from "../lib/grantManagement";

export function GrantManagementStep() {
  const {
    state,
    grantManagementUpdate,
    setActiveStep,
    networkAdd,
    networkUpdate,
  } = usePlayground();
  const gm = state.grantManagement;
  const metadata = state.discovery.metadata;
  const endpoint = metadata?.grant_management_endpoint;
  const grantId = state.token.grantId;
  const accessToken = state.token.accessToken;

  // What the current token can actually do here, from its granted scope.
  const grantedScopes = (state.token.scope ?? "").split(/\s+/).filter(Boolean);
  const canQuery = grantedScopes.includes("grant_management_query");
  const canRevoke = grantedScopes.includes("grant_management_revoke");

  const run = async (action: "query" | "revoke") => {
    if (!metadata || !grantId || !accessToken) return;
    grantManagementUpdate({
      status: "loading",
      lastAction: action,
      errorMessage: undefined,
      errorStatus: undefined,
      errorBody: undefined,
    });
    const input = {
      metadata,
      grantId,
      accessToken,
      onStart: networkAdd,
      onFinish: networkUpdate,
    };
    const fail = (res: { message: string; status?: number; body?: string }) =>
      grantManagementUpdate({
        status: "error",
        errorMessage: res.message,
        errorStatus: res.status,
        errorBody: res.body,
      });

    if (action === "query") {
      const res = await queryGrant(input);
      if (res.ok) {
        grantManagementUpdate({
          status: "success",
          grant: res.grant,
          fetchedAt: Date.now(),
        });
      } else fail(res);
    } else {
      const res = await revokeGrant(input);
      if (res.ok) {
        // Keep the tokens and the rest of the flow intact on purpose: the grant
        // is dead on the AS now, so the demonstration is to re-run Introspection
        // / Refresh / Resource and watch them fail.
        grantManagementUpdate({
          status: "success",
          revoked: true,
          grant: undefined,
          fetchedAt: Date.now(),
        });
      } else fail(res);
    }
  };

  return (
    <div className="mx-auto max-w-3xl @4xl:max-w-5xl">
      <StepHeader step="grant-management" right={renderPill(gm)} />

      {gm.revoked ? (
        <Banner tone="success" className="mt-5 p-4">
          <p className="flex items-center gap-1.5 text-[13.5px] font-medium">
            <Check className="h-4 w-4 text-[var(--status-success)]" />
            Grant revoked.
          </p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            The grant and every token it issued are now invalid on the AS. The
            tokens are kept here — re-run Introspection, Refresh, or a Resource
            call and watch them fail.
          </p>
        </Banner>
      ) : !accessToken ? (
        <Banner tone="warn" className="mt-5">
          <p>No access token yet — complete Token exchange first.</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-[var(--playground-accent)]"
            onClick={() => setActiveStep("token")}
          >
            Go to Token exchange →
          </Button>
        </Banner>
      ) : !grantId ? (
        <Banner tone="warn" className="mt-5">
          <p>
            This token isn't bound to a grant. Set{" "}
            <code className="font-mono">grant_management_action=create</code> in
            Auth request, then re-run to mint a grant_id.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-[var(--playground-accent)]"
            onClick={() => setActiveStep("auth-request")}
          >
            Go to Auth request →
          </Button>
        </Banner>
      ) : (
        <>
          <InfoCard
            label="Grant"
            description="Read or revoke the grant this access token is bound to."
            method="GET"
            url={`${endpoint}/${grantId}`}
            className="mt-5"
          >
            <p className="mt-2 text-[12.5px]">
              <span className="text-muted-foreground">grant_id · </span>
              <code className="font-mono">{grantId}</code>
            </p>
          </InfoCard>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              onClick={() => run("query")}
              disabled={gm.status === "loading" || gm.revoked}
            >
              {gm.status === "loading" && gm.lastAction === "query" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              Query grant
            </Button>
            <Button
              variant="secondary"
              onClick={() => run("revoke")}
              disabled={gm.status === "loading" || gm.revoked}
              className="text-[var(--status-error)]"
            >
              {gm.status === "loading" && gm.lastAction === "revoke" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Revoke grant
            </Button>
          </div>

          {(!canQuery || !canRevoke) && (
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              {!canQuery && (
                <>
                  Query needs{" "}
                  <code className="font-mono">grant_management_query</code>
                  .{" "}
                </>
              )}
              {!canRevoke && (
                <>
                  Revoke needs{" "}
                  <code className="font-mono">grant_management_revoke</code>
                  .{" "}
                </>
              )}
              Add the scope in Auth request and re-run the flow — the AS will
              likely reject the call without it.
            </p>
          )}

          {gm.status === "success" && gm.grant && !gm.revoked && (
            <GrantPanel grant={gm.grant} />
          )}

          {gm.status === "error" && (
            <ErrorPanel
              className="mt-4"
              message={gm.errorMessage ?? "Grant management call failed."}
              status={gm.errorStatus}
              body={gm.errorBody}
            />
          )}
        </>
      )}
    </div>
  );
}

function GrantPanel({ grant }: { grant: Record<string, unknown> }) {
  const scopesText = grantScopes(grant);
  const details = Array.isArray(grant.authorization_details)
    ? (grant.authorization_details as Array<Record<string, unknown>>)
    : null;
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-md border border-border bg-card/40 p-3 text-[12.5px]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">Grant</span>
          <GrantStatusBadge status={grantStatus(grant)} />
        </div>
        {scopesText && (
          <p className="mt-2">
            <span className="text-muted-foreground">scopes · </span>
            <span className="font-mono">{scopesText}</span>
          </p>
        )}
      </div>

      {details && (
        <div className="rounded-md border border-border bg-card/40 p-3">
          <p className="text-[12.5px] font-medium">authorization_details</p>
          <div className="mt-2">
            <AuthorizationDetailsBlock details={details} />
          </div>
        </div>
      )}

      <details className="rounded-lg border border-border bg-muted/20 p-4 text-[13px]">
        <summary className="cursor-pointer select-none text-[13px] font-semibold leading-5">
          Full grant response
        </summary>
        <pre className="mt-3 max-h-[320px] overflow-auto rounded-md border border-border bg-background/60 p-3 font-mono text-[11.5px] leading-relaxed">
          {JSON.stringify(grant, null, 2)}
        </pre>
      </details>
    </div>
  );
}

// A friendly one-liner for the grant's scopes; the full response is shown
// verbatim below regardless, so this only handles the two standard shapes.
function grantScopes(grant: Record<string, unknown>): string | null {
  if (typeof grant.scope === "string") return grant.scope;
  if (Array.isArray(grant.scopes)) {
    return grant.scopes.filter((s) => typeof s === "string").join(" ") || null;
  }
  return null;
}

function grantStatus(grant: Record<string, unknown>): string | undefined {
  return typeof grant.status === "string" ? grant.status : undefined;
}

function GrantStatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const revoked = /revok/i.test(status);
  const expired = /expir/i.test(status);
  const tone = revoked || expired ? "warn" : "success";
  return (
    <span
      className={
        tone === "success"
          ? "rounded-sm border border-[var(--status-success)]/40 bg-[color-mix(in_oklch,var(--status-success)_10%,transparent)] px-1.5 py-0.5 text-[11px]"
          : "rounded-sm border border-[var(--status-warn)]/40 bg-[color-mix(in_oklch,var(--status-warn)_10%,transparent)] px-1.5 py-0.5 text-[11px]"
      }
    >
      {status}
    </span>
  );
}

function renderPill(gm: {
  status: "idle" | "loading" | "success" | "error";
  revoked?: boolean;
}) {
  if (gm.status === "idle") return null;
  if (gm.status === "loading")
    return (
      <StatusPill tone="muted" spinning>
        working
      </StatusPill>
    );
  if (gm.status === "error")
    return (
      <StatusPill tone="error" icon={XCircle}>
        failed
      </StatusPill>
    );
  const tone: StatusTone = gm.revoked ? "warn" : "success";
  return (
    <StatusPill tone={tone}>{gm.revoked ? "revoked" : "queried"}</StatusPill>
  );
}
