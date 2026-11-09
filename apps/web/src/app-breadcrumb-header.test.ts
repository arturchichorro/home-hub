import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AppBreadcrumbHeader,
  getBreadcrumbLocation,
} from "./app-breadcrumb-header";

const location = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("@rocicorp/zero/react", () => ({
  useQuery: () => [[], { type: "complete" }],
}));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => string;
  }) => select({ location }),
  Link: ({
    to,
    params,
    children,
  }: {
    to: string;
    params: { householdId: string };
    children: ReactNode;
  }) =>
    createElement(
      "a",
      { href: to.replace("$householdId", params.householdId) },
      children,
    ),
}));

it("keeps Workouts as the back link on training pages with only one current breadcrumb", () => {
  const householdId = crypto.randomUUID();
  location.pathname = `/households/${householdId}/workouts/history`;
  const html = renderToStaticMarkup(
    createElement(AppBreadcrumbHeader, { onOpenSidebar() {} }),
  );

  expect(html).toContain(`href="/households/${householdId}/workouts"`);
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  expect(html).toContain("Training history");
});

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

  it("describes exercise detail pages without mistaking exercises for a workout ID", () => {
    expect(
      getBreadcrumbLocation("/households/home/workouts/exercises/exercise-a"),
    ).toEqual({
      householdId: "home",
      module: "workouts",
      exerciseId: "exercise-a",
    });
  });

  it("includes the opened workout", () => {
    expect(
      getBreadcrumbLocation("/households/home/workouts/workout-a"),
    ).toEqual({
      householdId: "home",
      module: "workouts",
      workoutId: "workout-a",
    });
  });

  it.each([
    ["session", "session"],
    ["sessions/log-id", "session"],
    ["history", "history"],
  ])(
    "does not mistake the training route %s for a workout UUID",
    (path, training) => {
      expect(
        getBreadcrumbLocation(`/households/home/workouts/${path}`),
      ).toEqual({ householdId: "home", module: "workouts", training });
    },
  );

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
