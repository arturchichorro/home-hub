import { enabledHouseholdModules } from "@home-hub/shared/module-order";
import type { HouseholdModuleKey } from "@home-hub/shared/modules";

export type HouseholdModuleRoute =
  `/households/$householdId/${HouseholdModuleKey | "settings"}`;

export function getDefaultHouseholdModuleRoute(
  settings: readonly { moduleKey: string; enabled: boolean }[],
  preference: unknown = [],
): HouseholdModuleRoute {
  const first = enabledHouseholdModules(settings, preference)[0] ?? "settings";

  return `/households/$householdId/${first}`;
}
