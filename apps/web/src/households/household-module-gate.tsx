import type { HouseholdModuleKey } from "@home-hub/shared/modules";
import { queries } from "@home-hub/shared/zero/queries";
import { InlineAlert } from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

type HouseholdModuleRoute =
  | "/households/$householdId/lists"
  | "/households/$householdId/recipes"
  | "/households/$householdId/habits"
  | "/households/$householdId/workouts"
  | "/households/$householdId/documents"
  | "/households/$householdId/logs"
  | "/households/$householdId/calendar"
  | "/households/$householdId/settings";

type ModuleSetting = {
  moduleKey: string;
  enabled: boolean;
};

type HouseholdModuleGateProps = {
  children: ReactNode;
  householdId: string;
  moduleKey: HouseholdModuleKey;
  preserveChildrenWhileRedirecting?: boolean;
};

export function getDefaultHouseholdModuleRoute(
  settings: readonly ModuleSetting[],
): HouseholdModuleRoute {
  if (
    settings.some((setting) => setting.moduleKey === "lists" && setting.enabled)
  ) {
    return "/households/$householdId/lists";
  }

  if (
    settings.some(
      (setting) => setting.moduleKey === "recipes" && setting.enabled,
    )
  ) {
    return "/households/$householdId/recipes";
  }

  if (
    settings.some(
      (setting) => setting.moduleKey === "habits" && setting.enabled,
    )
  ) {
    return "/households/$householdId/habits";
  }

  if (settings.some((s) => s.moduleKey === "workouts" && s.enabled)) {
    return "/households/$householdId/workouts";
  }

  if (settings.some((s) => s.moduleKey === "documents" && s.enabled)) {
    return "/households/$householdId/documents";
  }

  if (settings.some((s) => s.moduleKey === "logs" && s.enabled)) {
    return "/households/$householdId/logs";
  }

  if (settings.some((s) => s.moduleKey === "calendar" && s.enabled)) {
    return "/households/$householdId/calendar";
  }

  return "/households/$householdId/settings";
}

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

  // Draft owners must remain mounted while a redirect waits on their blocker.
  // Keep a stable fragment/child position in both enabled and disabled states.
  if (preserveChildrenWhileRedirecting) {
    return (
      <>
        {result.type === "error" ? (
          <InlineAlert role="alert" variant="danger">
            Unable to determine whether this module is enabled.
          </InlineAlert>
        ) : result.type === "complete" && !moduleEnabled ? (
          <Navigate
            to={getDefaultHouseholdModuleRoute(settings)}
            params={{ householdId }}
            replace
          />
        ) : null}
        {children}
      </>
    );
  }

  if (result.type === "error") {
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to determine whether this module is enabled.
      </InlineAlert>
    );
  }

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
