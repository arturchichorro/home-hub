import { queries } from "@home-hub/shared/zero/queries";
import { InlineAlert } from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

type HouseholdModuleKey = "shopping" | "recipes";

type HouseholdModuleRoute =
  | "/households/$householdId/shopping"
  | "/households/$householdId/recipes"
  | "/households/$householdId/settings";

type ModuleSetting = {
  moduleKey: string;
  enabled: boolean;
};

type HouseholdModuleGateProps = {
  children: ReactNode;
  householdId: string;
  moduleKey: HouseholdModuleKey;
};

export function getDefaultHouseholdModuleRoute(
  settings: readonly ModuleSetting[],
): HouseholdModuleRoute {
  if (
    settings.some(
      (setting) => setting.moduleKey === "shopping" && setting.enabled,
    )
  ) {
    return "/households/$householdId/shopping";
  }

  if (
    settings.some(
      (setting) => setting.moduleKey === "recipes" && setting.enabled,
    )
  ) {
    return "/households/$householdId/recipes";
  }

  return "/households/$householdId/settings";
}

export function HouseholdModuleGate({
  children,
  householdId,
  moduleKey,
}: HouseholdModuleGateProps) {
  const [settings, result] = useQuery(
    queries.modules.byHousehold({ householdId }),
  );

  if (result.type === "error") {
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to determine whether this module is enabled.
      </InlineAlert>
    );
  }

  const moduleEnabled = settings.some(
    (setting) => setting.moduleKey === moduleKey && setting.enabled,
  );

  if (result.type === "complete" && !moduleEnabled) {
    return (
      <Navigate
        to={getDefaultHouseholdModuleRoute(settings)}
        params={{ householdId }}
        replace
      />
    );
  }

  return children;
}
