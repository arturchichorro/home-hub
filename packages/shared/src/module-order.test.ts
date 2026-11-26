import { expect, it } from "vitest";
import {
  enabledHouseholdModules,
  moveHouseholdModule,
  orderedHouseholdModules,
  reorderModulesSchema,
} from "./module-order";

const defaults = [
  "calendar",
  "lists",
  "recipes",
  "habits",
  "workouts",
  "documents",
  "contacts",
];
const base = {
  householdId: crypto.randomUUID(),
  moduleKey: "recipes",
  orderedModuleKeys: ["recipes", "lists"],
  optimisticUpdatedAt: 1,
};

it("keeps the sidebar default, removes unsupported/duplicate values and appends missing modules", () => {
  expect(orderedHouseholdModules([])).toEqual(defaults);
  expect(orderedHouseholdModules(null)).toEqual(defaults);
  expect(orderedHouseholdModules({ invalid: true })).toEqual(defaults);
  expect(
    orderedHouseholdModules([
      "recipes",
      "settings",
      "recipes",
      1,
      null,
      "lists",
      "future-module",
    ]),
  ).toEqual([
    "recipes",
    "lists",
    "calendar",
    "habits",
    "workouts",
    "documents",
    "contacts",
  ]);
});

it("filters only enabled modules without changing the stored order", () => {
  const saved = ["recipes", "calendar", "lists"];
  const settings = [
    { moduleKey: "calendar", enabled: false },
    { moduleKey: "recipes", enabled: true },
    { moduleKey: "lists", enabled: true },
  ];
  expect(enabledHouseholdModules(settings, saved)).toEqual([
    "recipes",
    "lists",
  ]);
  expect(
    enabledHouseholdModules(
      [{ moduleKey: "calendar", enabled: true }, ...settings.slice(1)],
      saved,
    ),
  ).toEqual(["recipes", "calendar", "lists"]);
  expect(enabledHouseholdModules([], saved)).toEqual([]);
  expect(saved).toEqual(["recipes", "calendar", "lists"]);
});

it("moves only the selected module, retaining hidden modules and unseen ordering changes", () => {
  const moved = moveHouseholdModule([], "recipes", ["recipes", "lists"]);
  expect(moved).toEqual([
    "calendar",
    "recipes",
    "lists",
    "habits",
    "workouts",
    "documents",
    "contacts",
  ]);
  const concurrent = moveHouseholdModule(moved, "contacts", [
    "contacts",
    "calendar",
  ]);
  expect(concurrent).toEqual([
    "contacts",
    "calendar",
    "recipes",
    "lists",
    "habits",
    "workouts",
    "documents",
  ]);
  expect(
    moveHouseholdModule(concurrent, "recipes", ["lists", "recipes"]),
  ).toEqual([
    "contacts",
    "calendar",
    "lists",
    "recipes",
    "habits",
    "workouts",
    "documents",
  ]);
});

it("accepts only bounded, distinct content module keys and own-membership scope", () => {
  expect(reorderModulesSchema.safeParse(base).success).toBe(true);
  for (const patch of [
    { moduleKey: "settings" },
    { orderedModuleKeys: ["settings", "recipes"] },
    { orderedModuleKeys: ["recipes", "recipes"] },
    { orderedModuleKeys: [] },
    { orderedModuleKeys: ["lists"] },
    { orderedModuleKeys: ["unknown", "recipes"] },
    { userId: crypto.randomUUID() },
    { membershipId: crypto.randomUUID() },
    { optimisticUpdatedAt: -1 },
  ]) {
    expect(reorderModulesSchema.safeParse({ ...base, ...patch }).success).toBe(
      false,
    );
  }
});
