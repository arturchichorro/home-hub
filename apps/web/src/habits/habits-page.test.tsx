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
  it("shows personal Xs, period counts, and only other members with entries", () => {
    setup();
    const html = renderToStaticMarkup(<HabitsPage householdId={householdId} />);
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
    expect(html).not.toContain("Charlie");
    expect(html).toContain("2026-10-12 – 2026-10-18");
    expect(html).toContain(
      'aria-label="Read, Alice, 2026-10-14" aria-pressed="true"',
    );
    expect(html).toContain('aria-label="Read, Bob, 2026-10-13: completed"');
    expect(html).not.toMatch(/<button[^>]*aria-label="Read, Bob/);
    expect(html).toContain("1 day");
    expect(html).toContain('aria-label="Calendar view"');
    expect(html).toContain("Month");
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
        new RegExp(`<button[^>]*aria-label="Read, Alice, ${date}"[^>]*>`),
      )?.[0];
      expect(button).toBeDefined();
      expect(button).toContain("disabled");
    }
  });
  it("keeps own empty row so tracking needs no joining", () => {
    const habit = habits[0];
    if (!habit) throw new Error("Missing habit fixture");
    setup([{ ...habit, completions: [] }]);
    const html = renderToStaticMarkup(<HabitsPage householdId={householdId} />);
    expect(html).toContain("Alice");
    expect(html).not.toContain("Bob");
    expect(html).toContain("0 days");
    expect(html).not.toContain("Join habit");
  });
  it("renders cached data read-only while offline", () => {
    setup();
    useZeroMutationEnabled.mockReturnValue(false);
    const html = renderToStaticMarkup(<HabitsPage householdId={householdId} />);
    expect(html).toContain("Read-only");
    expect(html).toContain("Alice");
    const buttons = html.match(/<button[^>]*aria-label="Read, Alice,[^>]*>/g);
    expect(buttons).toHaveLength(7);
    expect(buttons?.every((button) => button.includes("disabled"))).toBe(true);
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
            : "No habits yet",
      );
    },
  );
});
