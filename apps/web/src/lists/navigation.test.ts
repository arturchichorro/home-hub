import { describe, expect, it } from "vitest";
import { moduleIsActive } from "../app-sidebar";
import { getDefaultHouseholdModuleRoute } from "../households/household-module-gate";

describe("Lists navigation", () => {
  it("highlights Lists in the library and on a list detail page", () => {
    expect(moduleIsActive("/households/h/lists", "h", "lists")).toBe(true);
    expect(moduleIsActive("/households/h/lists/list-1", "h", "lists")).toBe(
      true,
    );
    expect(moduleIsActive("/households/other/lists/list-1", "h", "lists")).toBe(
      false,
    );
    expect(moduleIsActive("/households/h/lists-other", "h", "lists")).toBe(
      false,
    );
  });
  it("defaults to Lists, without using old Shopping settings", () => {
    expect(
      getDefaultHouseholdModuleRoute([{ moduleKey: "lists", enabled: true }]),
    ).toBe("/households/$householdId/lists");
    expect(
      getDefaultHouseholdModuleRoute([
        { moduleKey: "shopping", enabled: true },
      ]),
    ).toBe("/households/$householdId/settings");
  });
  it("falls back when Lists is disabled", () => {
    expect(
      getDefaultHouseholdModuleRoute([
        { moduleKey: "lists", enabled: false },
        { moduleKey: "recipes", enabled: true },
      ]),
    ).toBe("/households/$householdId/recipes");
    expect(getDefaultHouseholdModuleRoute([])).toBe(
      "/households/$householdId/settings",
    );
  });
});
