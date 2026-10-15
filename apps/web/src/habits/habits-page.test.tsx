import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HabitsPage } from "./habits-page";

const { useQuery, useZeroMutationEnabled } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useZeroMutationEnabled: vi.fn(),
}));
vi.mock("@rocicorp/zero/react", () => ({
  useZero: () => ({ userID: "me", mutate: vi.fn() }),
  useQuery,
}));
vi.mock("../app-header-right-component", () => ({
  useAppHeaderRightComponent: vi.fn(),
}));
vi.mock("../zero/use-zero-mutation-enabled", () => ({
  useZeroMutationEnabled,
}));
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const habits = [
  {
    id: "habit-1",
    householdId,
    name: "Read",
    createdOn: "2026-10-13",
    archivedAt: null,
    completions: [
      { userId: "me", completedOn: "2026-10-14" },
      { userId: "other", completedOn: "2026-10-13" },
    ],
  },
];
const members = [
  { id: "member-1", userId: "me", user: { username: "Alice" } },
  { id: "member-2", userId: "other", user: { username: "Bob" } },
  { id: "member-3", userId: "empty", user: { username: "Charlie" } },
];
function setup(rows = habits, type = "complete") {
  useQuery
    .mockReturnValueOnce([rows, { type }])
    .mockReturnValueOnce([members, { type: "complete" }]);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
  useZeroMutationEnabled.mockReturnValue(true);
});
afterEach(() => vi.useRealTimers());

describe("Habits page", () => {
  it("disables next-month navigation in the present month", () => {
    setup();
    const html = renderToStaticMarkup(<HabitsPage householdId={householdId} />);
    expect(
      html.match(/<button[^>]*aria-label="Next month"[^>]*>/)?.[0],
    ).toContain('disabled=""');
    expect(
      html.match(/<button[^>]*aria-label="Previous month"[^>]*>/)?.[0],
    ).not.toContain('disabled=""');
  });
  it("shows the current shared month without week-view controls", () => {
    setup();
    const html = renderToStaticMarkup(<HabitsPage householdId={householdId} />);
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
    expect(html).not.toContain("Charlie");
    expect(html).toContain("October 2026");
    expect(html).toContain('aria-label="Current month"');
    expect(html).toContain("lucide-calendar");
    expect(html).not.toContain(">Today<");
    expect(html).toContain(
      'aria-label="Read, 2026-10-14. Completed by: Alice. Your completion: recorded." aria-pressed="true"',
    );
    expect(html).toContain("Read, 2026-10-13. Completed by: Bob.");
    expect(html).toContain("Shared monthly calendar");
    expect(
      html.match(/<button[^>]*aria-label="Read, 2026-[^>]*>/g),
    ).toHaveLength(31);
    expect(html).toContain("1 day");
    expect(html).not.toContain('aria-label="Calendar view"');
    expect(html).not.toContain(">Week<");
    expect(html).toContain('aria-label="Habit name"');
    expect(html).not.toContain(">Rename<");
    expect(html).not.toContain("Its history will be kept");
  });
  it("disables dates before creation and in the future", () => {
    setup();
    const html = renderToStaticMarkup(<HabitsPage householdId={householdId} />);
    for (const date of [
      "2026-10-12",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]) {
      const button = html.match(
        new RegExp(`<button[^>]*aria-label="Read, ${date}[^>]*>`),
      )?.[0];
      expect(button).toBeDefined();
      expect(button).toContain("disabled");
    }
  });
  it("keeps empty shared days and own totals without requiring joining", () => {
    const habit = habits[0];
    if (!habit) throw new Error("Missing habit fixture");
    setup([{ ...habit, completions: [] }]);
    const html = renderToStaticMarkup(<HabitsPage householdId={householdId} />);
    expect(html).toContain("Alice");
    expect(html).not.toContain("Bob");
    expect(html).toContain("0 days");
    expect(html).not.toContain("Join habit");
  });
  it("keeps cached data read-only without extra offline copy", () => {
    setup();
    useZeroMutationEnabled.mockReturnValue(false);
    const html = renderToStaticMarkup(<HabitsPage householdId={householdId} />);
    expect(html).not.toContain("Read-only");
    expect(html).not.toContain("synchronization is unavailable");
    expect(html).toContain("Alice");
    const buttons = html.match(/<button[^>]*aria-label="Read, 2026-[^>]*>/g);
    expect(buttons).toHaveLength(31);
    expect(
      buttons?.every((button) => button.includes('aria-disabled="true"')),
    ).toBe(true);
  });
  it.each(["unknown", "error", "complete"])(
    "handles %s query state",
    (type) => {
      setup([], type);
      const html = renderToStaticMarkup(
        <HabitsPage householdId={householdId} />,
      );
      expect(html).toContain(
        type === "unknown"
          ? "Loading habits"
          : type === "error"
            ? "Unable to load"
            : "No habits.",
      );
    },
  );
});
