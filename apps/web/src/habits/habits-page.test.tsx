import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HabitRow } from "./habit-days";
import { HabitsPage } from "./habits-page";

const { useQuery, enabled } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  enabled: vi.fn(),
}));
vi.mock("@rocicorp/zero/react", () => ({
  useZero: () => ({ userID: "me", mutate: vi.fn() }),
  useQuery,
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useBlocker: () => ({ status: "idle" }),
  Link: ({
    to,
    params,
    search,
    disabled,
    children,
    ...props
  }: {
    to: string;
    params: Record<string, string>;
    search: unknown;
    disabled: boolean;
    children: import("react").ReactNode;
  }) => (
    <a
      {...props}
      href={
        disabled
          ? undefined
          : Object.entries(params).reduce(
              (path, [key, value]) => path.replace(`$${key}`, value),
              to,
            )
      }
    >
      {children}
    </a>
  ),
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
const habit: HabitRow = {
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
const render = (props = {}) =>
  renderToStaticMarkup(<HabitsPage householdId={householdId} {...props} />);
describe("quick habits overview", () => {
  it("has one obvious today toggle, a name link and seven non-interactive preview days, not management/calendars", () => {
    setup();
    const html = render();
    expect(
      html.match(/aria-label="Read, 2026-10-15. Mark done"/g),
    ).toHaveLength(1);
    expect(html).toContain(`href="/households/${householdId}/habits/habit-1"`);
    expect(html.match(/role="img"/g)).toHaveLength(7);
    expect(html).not.toMatch(
      /<table|Previous month|Habit name|Workout link|Reorder Read|History for Read/,
    );
    expect(useQuery).toHaveBeenCalledTimes(2);
  });
  it("defaults to me and never mixes another person's completion or note into previews", () => {
    setup();
    const html = render();
    expect(html).toContain(">Me<");
    expect(html).not.toContain("Other note");
    expect(html).toContain("2026-10-15: Not recorded");
    expect(html).not.toContain("Clear completion");
  });
  it("shows another member's progress read-only while retaining the shared name link", () => {
    setup();
    const html = render({ person: "other" });
    expect(html).toContain("2026-10-15: Completed");
    expect(html).not.toContain("Mark done");
    expect(html).not.toContain("Clear completion");
    expect(html).not.toContain("<textarea");
    expect(html).toContain(">Read</a>");
    expect(html).toContain("Other note");
  });
  it("shows saved today notes directly and keeps notes from earlier dates in the detail flow", () => {
    setup([
      {
        ...habit,
        entries: [
          ...habit.entries,
          {
            userId: "me",
            entryOn: "2026-10-15",
            completed: false,
            note: "Stored today text",
          },
        ],
      },
    ]);
    const html = render();
    expect(html).toContain("Stored today text");
    expect(html).toContain("<textarea");
    expect(html).toContain("2026-10-14: Not recorded, has note");
  });
  it("makes automatic completion inspectable without an undo control", () => {
    setup([
      {
        ...habit,
        entries: [
          {
            userId: "me",
            entryOn: "2026-10-15",
            completed: true,
            note: "",
            workoutCompleted: true,
          },
        ],
      },
    ]);
    const html = render();
    expect(html).toContain("Completed from training");
    expect(html).not.toContain("Clear completion");
    expect(html).not.toContain("Mark done");
  });
  it("keeps archived progress inspectable without write controls", () => {
    setup();
    expect(render({ archived: true })).not.toMatch(
      /Mark done|Clear completion|<textarea/,
    );
  });
  it("keeps detail navigation available offline while disabling today's write", () => {
    enabled.mockReturnValue(false);
    setup();
    const html = render();
    expect(
      html.match(
        /<button[^>]*aria-label="Read, 2026-10-15. Mark done"[^>]*>/,
      )?.[0],
    ).toContain('disabled=""');
    expect(html).toContain(`href="/households/${householdId}/habits/habit-1"`);
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
            : "No habits yet.",
      );
    },
  );
});
