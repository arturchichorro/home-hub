import { householdModuleKeys } from "@home-hub/shared/modules";
import { queries } from "@home-hub/shared/zero/queries";
import { InlineAlert } from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { Navigate } from "@tanstack/react-router";
import { useOffline } from "../zero/use-offline";
import { getDefaultHouseholdModuleRoute } from "./navigation";

export function HouseholdLanding({ householdId }: { householdId?: string }) {
  const [memberships, result] = useQuery(queries.householdMemberships.mine({}));
  const offline = useOffline();
  if (result.type === "error") {
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to load households.
      </InlineAlert>
    );
  }

  // Cold offline queries remain unknown even when Zero has cached rows.
  // Online startup still waits for a complete view before choosing a route.
  if (result.type !== "complete" && !(offline && memberships.length > 0)) {
    return offline ? (
      <InlineAlert role="alert" variant="danger">
        Household data is unavailable offline.
      </InlineAlert>
    ) : (
      <p role="status" className="text-sm text-muted">
        Loading households…
      </p>
    );
  }

  const membership = householdId
    ? memberships.find((member) => member.householdId === householdId)
    : memberships[0];
  if (!membership?.household) {
    return householdId ? (
      <InlineAlert role="alert" variant="danger">
        Household unavailable.
      </InlineAlert>
    ) : null;
  }

  return (
    <ModuleLanding
      householdId={membership.householdId}
      preference={membership.moduleOrder}
      offline={offline}
    />
  );
}

function ModuleLanding({
  householdId,
  preference,
  offline,
}: {
  householdId: string;
  preference: unknown;
  offline: boolean;
}) {
  const [settings, result] = useQuery(
    queries.modules.byHousehold({ householdId }),
  );
  if (result.type === "error") {
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to load household modules.
      </InlineAlert>
    );
  }

  const cachedSettingsComplete = householdModuleKeys.every((key) =>
    settings.some((setting) => setting.moduleKey === key),
  );
  if (result.type !== "complete" && !(offline && cachedSettingsComplete)) {
    return offline ? (
      <InlineAlert role="alert" variant="danger">
        Household modules are unavailable offline.
      </InlineAlert>
    ) : (
      <p role="status" className="text-sm text-muted">
        Loading modules…
      </p>
    );
  }

  return (
    <Navigate
      to={getDefaultHouseholdModuleRoute(settings, preference)}
      params={{ householdId }}
      replace
    />
  );
}
