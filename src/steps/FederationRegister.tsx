// OpenID Federation Explicit Client Registration.
//
// Visible only when discovery surfaces a `federation_registration_endpoint`.
// User pastes either their RP entity configuration (signed JWT) or a
// pre-built trust chain (JSON array of JWTs); the AS returns a signed entity
// statement containing the issued client_id.

import { useMemo } from "react";
import { ArrowRight, Check, Loader2, RotateCw } from "lucide-react";
import { usePlayground } from "../store/playground";
import { Button } from "../components/ui/Button";
import { Textarea } from "../components/ui/Textarea";
import {
  Banner,
  Choice,
  ErrorPanel,
  InfoCard,
  JwtPanel,
  Section,
  StatusPill,
  StepHeader,
  type StatusTone,
} from "../components/step";
import { parseJwt, type JwtParsed } from "../protocol/jwt";
import { submitFederationRegistration } from "../protocol/federationRegister";
import type { FederationRegisterMode } from "../types";

const MODES: Array<{
  id: FederationRegisterMode;
  label: string;
  hint: string;
}> = [
  {
    id: "entity-config",
    label: "Entity Configuration",
    hint: "Paste your RP's signed entity configuration (a single JWT).",
  },
  {
    id: "trust-chain",
    label: "Trust Chain",
    hint: "Paste a JSON array of entity statement JWTs: [RP, intermediates…, Trust Anchor].",
  },
];

// `embedded` renders inside the Client step's "Other ways" area, without the
// page header/width wrapper — identity methods live there, not in the rail.
export function FederationRegisterStep({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const {
    state,
    federationRegisterUpdate,
    clientUpdate,
    setActiveStep,
    networkAdd,
    networkUpdate,
  } = usePlayground();
  const reg = state.federationRegister;
  const endpoint = state.discovery.metadata?.federation_registration_endpoint;
  const canSubmit = !!endpoint && reg.payload.trim().length > 0;

  const onSubmit = async () => {
    if (!endpoint || !canSubmit) return;
    federationRegisterUpdate({
      status: "loading",
      responseJwt: undefined,
      issuedClientId: undefined,
      errorMessage: undefined,
      errorStatus: undefined,
      errorBody: undefined,
    });
    const result = await submitFederationRegistration({
      endpoint,
      mode: reg.mode,
      payload: reg.payload,
      onStart: networkAdd,
      onFinish: networkUpdate,
    });
    if (result.ok) {
      federationRegisterUpdate({
        status: "success",
        responseJwt: result.responseJwt,
        issuedClientId: result.issuedClientId,
        registeredAt: Date.now(),
      });
    } else {
      federationRegisterUpdate({
        status: "error",
        errorMessage: result.message,
        errorStatus: result.status,
        errorBody: result.body,
      });
    }
  };

  const onApplyClientId = () => {
    if (!reg.issuedClientId) return;
    clientUpdate({ clientId: reg.issuedClientId });
    setActiveStep("auth-request");
  };

  const parsed = useMemo(() => {
    if (reg.status !== "success" || !reg.responseJwt) return null;
    const result = parseJwt(reg.responseJwt);
    return result.ok ? result.jwt : null;
  }, [reg.status, reg.responseJwt]);

  return (
    <div className={embedded ? "" : "mx-auto max-w-3xl @4xl:max-w-5xl"}>
      {!embedded && (
        <StepHeader step="federation-register" right={renderPill(reg.status)} />
      )}

      {!endpoint && (
        <Banner tone="warn" className="mt-5">
          This AS does not advertise{" "}
          <code>federation_registration_endpoint</code>.
        </Banner>
      )}

      {endpoint && (
        <InfoCard
          label="Request"
          description="OpenID Federation 1.0 Explicit Client Registration."
          method="POST"
          url={endpoint}
          className="mt-5"
        />
      )}

      <Section
        title="Payload"
        description={MODES.find((m) => m.id === reg.mode)?.hint}
        className="mt-4"
      >
        <Choice
          value={reg.mode}
          options={MODES}
          onChange={(mode) => federationRegisterUpdate({ mode })}
        />
        <Textarea
          className="mt-3 font-mono text-[12px]"
          rows={8}
          spellCheck={false}
          placeholder={
            reg.mode === "entity-config"
              ? "eyJhbGciOiJSUzI1NiIsImtpZCI6Ii4uLiJ9..."
              : '[ "eyJhbGciOi...", "eyJhbGciOi...", "eyJhbGciOi..." ]'
          }
          value={reg.payload}
          onChange={(e) =>
            federationRegisterUpdate({ payload: e.target.value })
          }
        />
      </Section>

      <div className="mt-4 flex flex-wrap gap-2">
        {reg.status === "loading" ? (
          <Button disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
            Registering…
          </Button>
        ) : reg.status === "success" ? (
          <Button variant="secondary" onClick={onSubmit} disabled={!canSubmit}>
            <RotateCw className="h-4 w-4" />
            Re-register
          </Button>
        ) : (
          <Button onClick={onSubmit} disabled={!canSubmit}>
            <ArrowRight className="h-4 w-4" />
            Register
          </Button>
        )}
      </div>

      {reg.status === "success" && parsed && (
        <SuccessPanel
          issuedClientId={reg.issuedClientId}
          parsed={parsed}
          onApply={onApplyClientId}
          currentClientId={state.client.clientId}
        />
      )}

      {reg.status === "error" && (
        <ErrorPanel
          className="mt-4"
          message={reg.errorMessage ?? "Unknown error."}
          status={reg.errorStatus}
          body={reg.errorBody}
        />
      )}
    </div>
  );
}

function SuccessPanel({
  issuedClientId,
  parsed,
  onApply,
  currentClientId,
}: {
  issuedClientId?: string;
  parsed: JwtParsed;
  onApply: () => void;
  currentClientId: string;
}) {
  const alreadyApplied = !!issuedClientId && issuedClientId === currentClientId;
  return (
    <div className="mt-4 space-y-4">
      <Banner tone="success" className="p-4">
        <p className="flex items-center gap-1.5 text-[13.5px] font-medium">
          <Check className="h-4 w-4 text-[var(--status-success)]" />
          Registered. The AS returned a signed entity statement.
        </p>
        {issuedClientId && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[12.5px]">
            <span className="text-muted-foreground">Issued client_id:</span>
            <code className="font-mono">{issuedClientId}</code>
            <Button
              variant="ghost"
              size="sm"
              onClick={onApply}
              disabled={alreadyApplied}
            >
              {alreadyApplied ? "Applied" : "Apply as client_id →"}
            </Button>
          </div>
        )}
      </Banner>

      <JwtPanel jwt={parsed} />
    </div>
  );
}

function renderPill(status: "idle" | "loading" | "success" | "error") {
  if (status === "idle") return null;
  const map: Record<
    Exclude<typeof status, "idle">,
    { tone: StatusTone; label: string; spinning?: boolean }
  > = {
    loading: { tone: "muted", label: "registering", spinning: true },
    success: { tone: "success", label: "registered" },
    error: { tone: "error", label: "failed" },
  };
  const p = map[status];
  return (
    <StatusPill tone={p.tone} spinning={p.spinning}>
      {p.label}
    </StatusPill>
  );
}
