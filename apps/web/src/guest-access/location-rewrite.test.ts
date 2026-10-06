import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { guestLocationRewrite } from "./location-rewrite";

const credential = `hhg_v1_${"A".repeat(43)}`;
describe("Guest navigation", () => {
  it("commits the recipe route and credential together without a second navigation", async () => {
    const root = createRootRoute();
    const recipes = createRoute({
      getParentRoute: () => root,
      path: "/households/$householdId/recipes",
    });
    const detail = createRoute({
      getParentRoute: () => root,
      path: "/households/$householdId/recipes/$recipeId",
    });
    const history = createMemoryHistory({
      initialEntries: [`/households/home/recipes#${credential}`],
    });
    const router = createRouter({
      routeTree: root.addChildren([recipes, detail]),
      history,
      rewrite: guestLocationRewrite(credential),
    });
    // RouterProvider normally subscribes to history; exercise the same load cycle.
    history.subscribe(() => {
      void router.load();
    });
    await router.load();
    const actions: string[] = [];
    history.subscribe(({ action }) => actions.push(action.type));
    await router.navigate({
      to: "/households/$householdId/recipes/$recipeId",
      params: { householdId: "home", recipeId: "dinner" },
    });
    expect(history.location.href).toBe(
      `/households/home/recipes/dinner#${credential}`,
    );
    expect(router.state.location.pathname).toBe(
      "/households/home/recipes/dinner",
    );
    expect(router.state.location.hash).toBe("");
    expect(actions).toEqual(["PUSH"]);

    // Back, forward, and reload all retain the credential and intended route.
    history.back();
    await router.load();
    expect(history.location.href).toBe(
      `/households/home/recipes#${credential}`,
    );
    history.forward();
    await router.load();
    expect(router.state.location.pathname).toBe(
      "/households/home/recipes/dinner",
    );
    expect(history.location.hash).toBe(`#${credential}`);
    await router.load();
    expect(router.state.location.pathname).toBe(
      "/households/home/recipes/dinner",
    );
  });
  it("keeps search parameters and never adds the credential to path or query", () => {
    const rewrite = guestLocationRewrite(credential);
    const url = new URL(
      "https://guest.example/households/home/recipes?sort=title",
    );
    rewrite.output?.({ url });
    expect(url.pathname + url.search).toBe(
      "/households/home/recipes?sort=title",
    );
    expect(url.hash).toBe(`#${credential}`);
    rewrite.input?.({ url });
    expect(url.hash).toBe("");
  });
});
