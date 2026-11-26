import type { HouseholdModuleKey } from "@home-hub/shared/modules";
import { queries } from "@home-hub/shared/zero/queries";
import { InlineAlert } from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import type { ReactNode } from "react";
import { HouseholdLanding } from "./household-landing";

type HouseholdModuleGateProps = {
  children: ReactNode;
  householdId: string;
  moduleKey: HouseholdModuleKey;
  preserveChildrenWhileRedirecting?: boolean;
};

export function HouseholdModuleGate({
  children,
  householdId,
  moduleKey,
  preserveChildrenWhileRedirecting = false,
}: HouseholdModuleGateProps) {
  const [settings, result] = useQuery(
    queries.modules.byHousehold({ householdId }),
  );
  const moduleEnabled = settings.some(
    (setting) => setting.moduleKey === moduleKey && setting.enabled,
  );
  const unavailable =
    result.type === "error" ? (
      <InlineAlert role="alert" variant="danger">
        Unable to determine whether this module is enabled.
      </InlineAlert>
    ) : result.type === "complete" && !moduleEnabled ? (
      <HouseholdLanding householdId={householdId} />
    ) : null;

  // Draft owners must remain mounted while a redirect waits on their blocker.
  // Keep a stable fragment/child position in both enabled and disabled states.
  if (preserveChildrenWhileRedirecting) {
    return (
      <>
        {unavailable}
        {children}
      </>
    );
  }

  return unavailable ?? children;
}
