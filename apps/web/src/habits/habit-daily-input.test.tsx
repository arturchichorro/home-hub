import { queries } from "@home-hub/shared/zero/queries";
import type { TooltipProps } from "@home-hub/ui-web";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HabitDay as daysActual, type HabitDay } from "./habit-calendar-shared";
import { HabitDailyInput } from "./habit-daily-input";

const { useQuery, days } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  days: vi.fn<(props: Parameters<typeof HabitDay>[0]) => void>(),
}));
vi.mock("@rocicorp/zero/react", () => ({
  useQuery,
  useZero: () => ({ mutate: vi.fn() }),
}));
vi.mock("../zero/use-zero-mutation-enabled", () => ({
  useZeroMutationEnabled: () => true,
}));
vi.mock("./habit-calendar-shared", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./habit-calendar-shared")>();
  return {
    ...actual,
    HabitDay: (props: Parameters<typeof HabitDay>[0]) => {
      days(props);
      return actual.HabitDay(props);
    },
  };
});
const habits = [
  {
    id: "habit-walk",
    name: "Walk",
    entries: [{ userId: "alice", entryOn: "2026-10-15", completed: true }],
  },
  { id: "habit-read", name: "Read", entries: [] },
];
const props = {
  householdId: "d92e5c4e-1c68-4942-9cc9-710207661bca",
  today: "2026-10-15",
  members: [{ userId: "alice", user: { username: "Alice" } }],
  currentUserId: "alice",
  enabled: true,
  pending: new Set<string>(),
  onSetCompleted: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  useQuery.mockReset();
  useQuery.mockReturnValue([habits, { type: "complete" }]);
});

describe("daily habit input", () => {
  it("keeps notes editable while a completion is saving", () => {
    useQuery.mockReturnValue([habits, { type: "complete" }]);
    const html = renderToStaticMarkup(
      <HabitDailyInput
        {...props}
        pending={new Set(["habit-walk:2026-10-15"])}
      />,
    );
    const noteButton = html.match(
      /<button[^>]*aria-label="Add note to Walk on 2026-10-15"[^>]*>/,
    )?.[0];
    expect(noteButton).toBeDefined();
    expect(noteButton).not.toMatch(
      /\s(?:disabled|aria-disabled|data-disabled)=/,
    );
    expect(html).toContain('aria-disabled="true"');
  });
  it("loads only the current member's daily note into the editor without requiring completion", () => {
    const base = habits[0];
    if (!base) throw new Error("Missing habit fixture");
    useQuery.mockReturnValue([
      [
        {
          ...base,
          entries: [
            {
              userId: "alice",
              entryOn: props.today,
              completed: false,
              note: "My note",
            },
            {
              userId: "bob",
              entryOn: props.today,
              completed: false,
              note: "Someone else's note",
            },
          ],
        },
      ],
      { type: "complete" },
    ]);
    const html = renderToStaticMarkup(<HabitDailyInput {...props} />);
    expect(html).toContain('aria-label="Note for Walk on 2026-10-15"');
    expect(html).toContain("My note");
    expect(html).not.toContain("Someone else");
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).not.toContain("bg-raised!");
  });
  it("queries today independently of the browsed calendar month", () => {
    renderToStaticMarkup(<HabitDailyInput {...props} />);
    expect(useQuery).toHaveBeenCalledWith(
      queries.habits.byHousehold({
        householdId: props.householdId,
        startOn: props.today,
        endOn: props.today,
        archived: false,
      }),
    );
  });
  it("preserves shared query order and shows only names above one square each", () => {
    const html = renderToStaticMarkup(<HabitDailyInput {...props} />);
    expect(html.indexOf(">Walk</span>")).toBeLessThan(
      html.indexOf(">Read</span>"),
    );
    expect(html.match(/<li /g)).toHaveLength(2);
    expect(html.match(/<button[^>]*aria-pressed=/g)).toHaveLength(2);
    expect(html).toContain("size-14");
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("[scrollbar-width:none]");
    expect(html).not.toContain("<h");
    expect(html).not.toContain("Mark today");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("bg-raised!");
  });
  it("uses the same today/date pending key as the full calendar", () => {
    renderToStaticMarkup(
      <HabitDailyInput
        {...props}
        pending={new Set(["habit-walk:2026-10-15"])}
      />,
    );
    const first = days.mock.calls[0]?.[0];
    expect(first?.date).toBe(props.today);
    expect(first?.pending.has("habit-walk:2026-10-15")).toBe(true);
    first?.onSetCompleted(props.today, false);
    expect(props.onSetCompleted).toHaveBeenCalledWith("habit-walk", false);
  });
  it("clicking a square marks today or removes today's own completion", () => {
    renderToStaticMarkup(<HabitDailyInput {...props} />);
    for (const [data] of [...days.mock.calls]) {
      const element = HabitDayElement(data);
      element.props.onClick();
    }
    expect(props.onSetCompleted.mock.calls).toEqual([
      ["habit-walk", false],
      ["habit-read", true],
    ]);
  });
  it("disables daily input offline without additional status text", () => {
    const html = renderToStaticMarkup(
      <HabitDailyInput {...props} enabled={false} />,
    );
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(2);
    expect(html).not.toContain("Read-only");
  });
  it("displays no row when there are no active habits", () => {
    useQuery.mockReturnValue([[], { type: "complete" }]);
    expect(renderToStaticMarkup(<HabitDailyInput {...props} />)).toBe("");
  });
});

// Read the real shared day trigger so this covers its own-only toggle behavior,
// not a separate daily-input implementation of completion logic.
function HabitDayElement(data: Parameters<typeof HabitDay>[0]) {
  const element = daysActual(data).props as TooltipProps;
  return element.trigger as ReactElement<{ onClick: () => void }>;
}
