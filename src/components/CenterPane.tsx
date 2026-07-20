import { type ComponentType } from "react";
import { usePlayground } from "../store/playground";
import { STEPS, type StepId } from "../types";
import { DiscoveryStep } from "../steps/Discovery";
import { ClientStep } from "../steps/Client";
import { DcrRegisterStep } from "../steps/DcrRegister";
import { FederationRegisterStep } from "../steps/FederationRegister";
import { AuthRequestStep } from "../steps/AuthRequest";
import { ParStep } from "../steps/Par";
import { AuthorizeStep } from "../steps/Authorize";
import { TokenStep } from "../steps/Token";
import { InspectStep } from "../steps/Inspect";
import { UserInfoStep } from "../steps/UserInfo";
import { IntrospectStep } from "../steps/Introspect";
import { ResourceStep } from "../steps/Resource";
import { RefreshStep } from "../steps/Refresh";
import { RevokeStep } from "../steps/Revoke";

const STEP_COMPONENTS: Record<StepId, ComponentType> = {
  discovery: DiscoveryStep,
  client: ClientStep,
  "dcr-register": DcrRegisterStep,
  "federation-register": FederationRegisterStep,
  "auth-request": AuthRequestStep,
  par: ParStep,
  authorize: AuthorizeStep,
  token: TokenStep,
  inspect: InspectStep,
  userinfo: UserInfoStep,
  introspect: IntrospectStep,
  resource: ResourceStep,
  refresh: RefreshStep,
  revoke: RevokeStep,
};

export function CenterPane() {
  const { state } = usePlayground();
  const ActiveStep = STEP_COMPONENTS[state.activeStep];
  const stepDef = STEPS.find((s) => s.id === state.activeStep);

  return (
    <main className="flex-1 overflow-y-auto bg-background">
      <div className="px-8 py-6">
        {ActiveStep ? (
          <ActiveStep />
        ) : (
          <ComingSoon
            stepNumber={stepDef?.number ?? 0}
            stepName={stepDef?.name ?? ""}
          />
        )}
      </div>
    </main>
  );
}

function ComingSoon({ stepNumber, stepName }: { stepNumber: number; stepName: string }) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="border-b border-border pb-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Step {stepNumber}
        </div>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight">
          {stepName}
        </h1>
      </div>
      <p className="mt-6 text-[13.5px] text-muted-foreground">
        Not built yet. See Appendix A of the design doc for build order.
      </p>
    </div>
  );
}
