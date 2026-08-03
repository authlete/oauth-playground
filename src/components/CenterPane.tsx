import { type ComponentType } from "react";
import { usePlayground } from "../store/playground";
import { type StepId } from "../types";
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

  return (
    <main className="flex-1 overflow-y-auto bg-background">
      <div className="px-8 py-6">
        <ActiveStep />
      </div>
    </main>
  );
}
