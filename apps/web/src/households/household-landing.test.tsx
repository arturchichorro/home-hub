import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { HouseholdLanding } from "./household-landing";
import { getDefaultHouseholdModuleRoute } from "./navigation";

const { query, state } = vi.hoisted(() => ({
  query: vi.fn(),
  state: { offline: false },
}));
vi.mock("../zero/use-offline", () => ({ useOffline: () => state.offline }));
vi.mock("@rocicorp/zero/react", () => ({ useQuery: query }));
vi.mock("@tanstack/react-router", () => ({
  Navigate: ({
    to,
    params,
    replace,
  }: {
    to: string;
    params: { householdId: string };
    replace: boolean;
  }) => (
    <span
      data-destination={to}
      data-household={params.householdId}
      data-replace={String(replace)}
    />
  ),
}));
const member = (householdId: string, moduleOrder: string[] = []) => ({
  householdId,
  household: { id: householdId },
  moduleOrder,
});
const complete = { type: "complete" };
beforeEach(() => {
  query.mockReset();
  state.offline = false;
});

it("opens the first sidebar membership, not alphabetical/last-visited household order", () => {
  query.mockReturnValueOnce([
    [member("b", ["recipes", "lists"]), member("a")],
    complete,
  ]);
  query.mockReturnValueOnce([
    [
      { moduleKey: "lists", enabled: true },
      { moduleKey: "recipes", enabled: true },
    ],
    complete,
  ]);
  const html = renderToStaticMarkup(<HouseholdLanding />);
  expect(html).toContain('data-household="b"');
  expect(html).toContain('data-destination="/households/$householdId/recipes"');
  expect(html).toContain('data-replace="true"');
});

it("uses the requested household's own preference and falls back to Settings only after readiness", () => {
  query.mockReturnValueOnce([
    [member("b"), member("a", ["contacts"])],
    complete,
  ]);
  query.mockReturnValueOnce([[], complete]);
  const html = renderToStaticMarkup(<HouseholdLanding householdId="a" />);
  expect(html).toContain('data-household="a"');
  expect(html).toContain("/settings");
});

it("leaves the current empty homepage unchanged when the user has no households", () => {
  query.mockReturnValueOnce([[], complete]);
  expect(renderToStaticMarkup(<HouseholdLanding />)).toBe("");
  expect(query).toHaveBeenCalledTimes(1);
});

it("does not redirect on incomplete membership or module results", () => {
  query.mockReturnValueOnce([[], { type: "unknown" }]);
  expect(renderToStaticMarkup(<HouseholdLanding />)).toContain(
    "Loading households",
  );
  query.mockReturnValueOnce([[member("a")], complete]);
  query.mockReturnValueOnce([[], { type: "unknown" }]);
  const html = renderToStaticMarkup(<HouseholdLanding />);
  expect(html).toContain("Loading modules");
  expect(html).not.toContain("data-destination");
});

it("reports unavailable memberships and query failures instead of redirect loops", () => {
  query.mockReturnValueOnce([[], complete]);
  expect(
    renderToStaticMarkup(<HouseholdLanding householdId="removed" />),
  ).toContain("Household unavailable");
  query.mockReturnValueOnce([[], { type: "error" }]);
  expect(renderToStaticMarkup(<HouseholdLanding />)).toContain(
    "Unable to load households",
  );
  query.mockReturnValueOnce([[member("a")], complete]);
  query.mockReturnValueOnce([[], { type: "error" }]);
  expect(renderToStaticMarkup(<HouseholdLanding />)).toContain(
    "Unable to load household modules",
  );
});

it("uses positive cached membership and complete cached module settings for a cold offline landing", () => {
  state.offline = true;
  query.mockReturnValueOnce([
    [member("a", ["recipes", "calendar"])],
    { type: "unknown" },
  ]);
  query.mockReturnValueOnce([
    [
      ...[
        "calendar",
        "lists",
        "recipes",
        "habits",
        "workouts",
        "documents",
        "contacts",
      ].map((moduleKey) => ({
        moduleKey,
        enabled: moduleKey === "recipes" || moduleKey === "calendar",
      })),
    ],
    { type: "unknown" },
  ]);
  const html = renderToStaticMarkup(<HouseholdLanding />);
  expect(html).toContain('data-destination="/households/$householdId/recipes"');
});

it("does not treat missing/partial offline cache as an empty household or disabled modules", () => {
  state.offline = true;
  query.mockReturnValueOnce([[], { type: "unknown" }]);
  expect(renderToStaticMarkup(<HouseholdLanding />)).toContain(
    "Household data is unavailable offline",
  );
  query.mockReturnValueOnce([[member("a")], { type: "unknown" }]);
  query.mockReturnValueOnce([
    [{ moduleKey: "lists", enabled: false }],
    { type: "unknown" },
  ]);
  const html = renderToStaticMarkup(<HouseholdLanding />);
  expect(html).toContain("Household modules are unavailable offline");
  expect(html).not.toContain("data-destination");
});

it("does not use stale cached rows to choose an online landing before query completeness", () => {
  query.mockReturnValueOnce([[member("a")], { type: "unknown" }]);
  expect(renderToStaticMarkup(<HouseholdLanding />)).toContain(
    "Loading households",
  );
  query.mockReturnValueOnce([[member("a")], complete]);
  query.mockReturnValueOnce([
    [{ moduleKey: "recipes", enabled: true }],
    { type: "unknown" },
  ]);
  expect(renderToStaticMarkup(<HouseholdLanding />)).toContain(
    "Loading modules",
  );
});

it("uses the same enabled personal order and default Calendar priority for landing routes", () => {
  const settings = ["lists", "calendar", "recipes"].map((moduleKey) => ({
    moduleKey,
    enabled: true,
  }));
  expect(getDefaultHouseholdModuleRoute(settings)).toBe(
    "/households/$householdId/calendar",
  );
  expect(
    getDefaultHouseholdModuleRoute(settings, ["recipes", "lists", "calendar"]),
  ).toBe("/households/$householdId/recipes");
  expect(
    getDefaultHouseholdModuleRoute(
      [{ moduleKey: "recipes", enabled: false }],
      ["recipes"],
    ),
  ).toBe("/households/$householdId/settings");
});
