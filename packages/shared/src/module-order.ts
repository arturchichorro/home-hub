import * as z from "zod";
import {
  type HouseholdModuleKey,
  householdModuleKeySchema,
  householdModuleKeys,
} from "./modules";

const defaultOrder: readonly HouseholdModuleKey[] = [
  "calendar",
  ...householdModuleKeys.filter((key) => key !== "calendar"),
];

export function orderedHouseholdModules(
  preference: unknown,
): HouseholdModuleKey[] {
  const saved = Array.isArray(preference)
    ? preference.filter(
        (key): key is HouseholdModuleKey =>
          householdModuleKeySchema.safeParse(key).success,
      )
    : [];

  return [...new Set([...saved, ...defaultOrder])];
}

export function enabledHouseholdModules(
  settings: readonly { moduleKey: string; enabled: boolean }[],
  preference: unknown,
): HouseholdModuleKey[] {
  const enabled = new Set(
    settings
      .filter((setting) => setting.enabled)
      .map((setting) => setting.moduleKey),
  );

  return orderedHouseholdModules(preference).filter((key) => enabled.has(key));
}

export const reorderModulesSchema = z
  .object({
    householdId: z.uuid(),
    moduleKey: householdModuleKeySchema,
    orderedModuleKeys: z
      .array(householdModuleKeySchema)
      .min(1)
      .max(householdModuleKeys.length)
      .refine(
        (keys) => new Set(keys).size === keys.length,
        "Duplicate modules",
      ),
    optimisticUpdatedAt: z.number().int().nonnegative(),
  })
  .strict()
  .refine(
    (value) => value.orderedModuleKeys.includes(value.moduleKey),
    "Moved module is missing",
  );

// Move only the requested module. Keep hidden modules and concurrent/unseen
// entries in their existing relative order, rather than replacing a snapshot.
export function moveHouseholdModule(
  preference: unknown,
  moved: HouseholdModuleKey,
  orderedKeys: readonly HouseholdModuleKey[],
): HouseholdModuleKey[] {
  const position = orderedKeys.indexOf(moved);
  if (position === -1) {
    throw Error("Moved module is missing");
  }

  const remaining = orderedHouseholdModules(preference).filter(
    (key) => key !== moved,
  );
  const next = orderedKeys[position + 1];
  const previous = orderedKeys[position - 1];
  const target = next
    ? remaining.indexOf(next)
    : previous
      ? remaining.indexOf(previous) + 1
      : 0;
  remaining.splice(target, 0, moved);

  return remaining;
}
