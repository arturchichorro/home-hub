import { describe, expect, it } from "vitest";

import {
  householdModuleCatalog,
  householdModuleKeySchema,
  householdModuleKeys,
  setHouseholdModuleEnabledRequestSchema,
} from "./modules";

describe("household module catalogue", () => {
  it("defines the stable initial module keys", () => {
    expect(householdModuleKeys).toEqual(["shopping", "recipes"]);
    expect(householdModuleCatalog.map(({ key }) => key)).toEqual([
      "shopping",
      "recipes",
    ]);
  });

  it("contains no duplicate keys", () => {
    const keys = householdModuleCatalog.map(({ key }) => key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("enables Shopping and Recipes by default", () => {
    expect(householdModuleCatalog).toEqual([
      { key: "shopping", label: "Shopping", defaultEnabled: true },
      { key: "recipes", label: "Recipes", defaultEnabled: true },
    ]);
  });

  it.each(householdModuleKeys)("accepts the supported key %s", (key) => {
    expect(householdModuleKeySchema.parse(key)).toBe(key);
  });

  it.each(["", "recipe", "vocabulary", "SHOPPING"])(
    "rejects the unsupported key %s",
    (key) => {
      expect(householdModuleKeySchema.safeParse(key).success).toBe(false);
    },
  );
});

describe("set household module enabled request", () => {
  it.each([true, false])("accepts enabled=%s", (enabled) => {
    expect(setHouseholdModuleEnabledRequestSchema.parse({ enabled })).toEqual({
      enabled,
    });
  });

  it.each([
    {},
    { enabled: "true" },
    { enabled: 1 },
    { enabled: null },
    { enabled: true, unexpected: true },
  ])("rejects an invalid request: %o", (request) => {
    expect(
      setHouseholdModuleEnabledRequestSchema.safeParse(request).success,
    ).toBe(false);
  });
});
