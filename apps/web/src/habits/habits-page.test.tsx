import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HabitsPage } from "./habits-page";

const { useQuery, enabled } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  enabled: vi.fn(),
}));
vi.mock("@rocicorp/zero/react", () => ({
  useZero: () => ({ userID: "me", mutate: vi.fn() }),
  useQuery,
}));
vi.mock("../app-header-right-component", () => ({
  useAppHeaderRightComponent: vi.fn(),
}));
vi.mock("../zero/use-zero-mutation-enabled", () => ({
  useZeroMutationEnabled: enabled,
}));
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const members = [
  { userId: "me", user: { username: "Alice" } },
  { userId: "other", user: { username: "Bob" } },
];
const habit = {
  id: "habit-1",
  name: "Read",
  entries: [
    {
      userId: "me",
      entryOn: "2026-10-14",
      completed: false,
      note: "Tram reading",
    },
    {
      userId: "other",
      entryOn: "2026-10-15",
      completed: true,
      note: "Other note",
    },
  ],
};
function setup(rows = [habit], type = "complete") {
  useQuery
    .mockReturnValueOnce([members, { type: "complete" }])
    .mockReturnValueOnce([rows, { type }]);
}
beforeEach(() => {
  vi.clearAllMocks();
  useQuery.mockReset();
  enabled.mockReturnValue(true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());
const render = () =>
  renderToStaticMarkup(<HabitsPage householdId={householdId} />);
describe("today-first habits", () => {
  it("renders one compact list with six past days, a separate today action and no mounted calendars", () => {
    setup();
    const html = render();
    expect(html).toContain('aria-label="Read, 2026-10-15. Mark done"');
    expect(html).toContain(
      'aria-label="History for Read" aria-expanded="false"',
    );
    expect(
      html.match(/aria-label="Read, 2026-10-(09|10|11|12|13|14)\./g),
    ).toHaveLength(6);
    expect(html).not.toContain("<table");
    expect(html).not.toContain("Previous month");
    expect(html).not.toContain("Today's habits");
    expect(html).toContain('aria-label="Habit name"');
    expect(useQuery).toHaveBeenCalledTimes(2);
  });
  it("defaults to me, lists the roster, and does not mix another person's completion or note into the row", () => {
    setup();
    const html = render();
    expect(html).toContain('value="me" selected="">Me');
    expect(html).toContain(">Bob<");
    expect(html).not.toContain("Other note");
    expect(html).not.toContain("Clear completion");
  });
  it("exposes note-only dates without falsely marking them completed", () => {
    setup();
    const html = render();
    expect(html).toContain(
      "Read, 2026-10-14. Not recorded. Note: Tram reading",
    );
    expect(html).not.toContain("Read, 2026-10-14. Completed");
  });
  it("keeps inspection available offline while disabling today's write", () => {
    enabled.mockReturnValue(false);
    setup();
    const html = render();
    expect(
      html.match(
        /<button[^>]*aria-label="Read, 2026-10-15\. Mark done"[^>]*>/,
      )?.[0],
    ).toContain('disabled=""');
    expect(
      html.match(/<button[^>]*aria-label="History for Read"[^>]*>/)?.[0],
    ).not.toContain('disabled=""');
    expect(html).not.toContain("Read-only");
  });
  it.each(["unknown", "error", "complete"])(
    "handles %s query state",
    (type) => {
      setup([], type);
      expect(render()).toContain(
        type === "unknown"
          ? "Loading habits"
          : type === "error"
            ? "Unable to load"
            : "No habits.",
      );
    },
  );
});
