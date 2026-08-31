import { describe, expect, it } from "vitest";
import { getBreadcrumbLocation } from "./app-breadcrumb-header";

describe("getBreadcrumbLocation", () => {
  it("describes household module and recipe routes", () => {
    expect(
      getBreadcrumbLocation("/households/household-1/recipes/recipe-1"),
    ).toEqual({
      householdId: "household-1",
      module: "recipes",
      recipeId: "recipe-1",
    });
  });

  it("describes module routes without inventing an item", () => {
    expect(getBreadcrumbLocation("/households/household-1/lists")).toEqual({
      householdId: "household-1",
      module: "lists",
    });
  });

  it("returns the home location outside a household", () => {
    expect(getBreadcrumbLocation("/")).toEqual({});
  });
  it("includes the opened list and ignores the retired Shopping route", () => {
    expect(
      getBreadcrumbLocation("/households/household-1/lists/list-1"),
    ).toEqual({
      householdId: "household-1",
      module: "lists",
      listId: "list-1",
    });
    expect(getBreadcrumbLocation("/households/household-1/shopping")).toEqual({
      householdId: "household-1",
    });
  });
});
