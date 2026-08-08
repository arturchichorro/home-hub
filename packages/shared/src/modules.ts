import * as z from "zod";

export const householdModuleKeys = ["shopping", "recipes"] as const;

export type HouseholdModuleKey = (typeof householdModuleKeys)[number];

export const householdModuleKeySchema = z.enum(householdModuleKeys);

export type HouseholdModuleDefinition = {
  key: HouseholdModuleKey;
  label: string;
  defaultEnabled: boolean;
};

export const householdModuleCatalog = [
  { key: "shopping", label: "Shopping", defaultEnabled: true },
  { key: "recipes", label: "Recipes", defaultEnabled: true },
] as const satisfies readonly HouseholdModuleDefinition[];
