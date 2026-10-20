import * as z from "zod";

export const householdModuleKeys = ["lists", "recipes", "habits"] as const;

export type HouseholdModuleKey = (typeof householdModuleKeys)[number];

export const householdModuleKeySchema = z.enum(householdModuleKeys);

export type HouseholdModuleDefinition = {
  key: HouseholdModuleKey;
  label: string;
  defaultEnabled: boolean;
};

export const householdModuleCatalog = [
  { key: "lists", label: "Lists", defaultEnabled: true },
  { key: "recipes", label: "Recipes", defaultEnabled: true },
  { key: "habits", label: "Habits", defaultEnabled: false },
] as const satisfies readonly HouseholdModuleDefinition[];

export const setHouseholdModuleEnabledRequestSchema = z
  .object({
    enabled: z.boolean(),
  })
  .strict();

export type SetHouseholdModuleEnabledRequest = z.infer<
  typeof setHouseholdModuleEnabledRequestSchema
>;
