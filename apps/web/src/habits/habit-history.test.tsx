import { habitMonth } from "@home-hub/shared/habits";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HabitDayPreview, monthCalendarWeeks } from "./habit-days";
import { HabitHistory } from "./habit-history";

const { useQuery, buttons } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  buttons: [] as { onClick?: () => void; "aria-label"?: string }[],
}));
vi.mock("@rocicorp/zero/react", () => ({
  useQuery,
  useZero: () => ({ userID: "me", mutate: vi.fn() }),
}));
vi.mock("../zero/use-zero-mutation-enabled", () => ({
  useZeroMutationEnabled: () => true,
}));
vi.mock("@home-hub/ui-web", async (original) => {
  const actual = await original<typeof import("@home-hub/ui-web")>();
  return {
    ...actual,
    Button: (props: Parameters<typeof actual.Button>[0]) => {
      buttons.push({
        onClick: () => {
          if (props.onClick) Reflect.apply(props.onClick, undefined, []);
        },
      });
      return <actual.Button {...props} />;
    },
  };
});
const base = {
  householdId: "d92e5c4e-1c68-4942-9cc9-710207661bca",
  habitId: "cf8e0455-182d-4c35-aab0-7c45d9009852",
  name: "Read",
  personId: "me",
  own: true,
  archived: false,
  today: "2026-10-15",
  anchor: "2026-10-01",
  enabled: true,
  locked: false,
  pending: new Set<string>(),
  onMonth: vi.fn(),
  onDate: vi.fn(),
  onCompleted: vi.fn(),
  onDirtyChange: vi.fn(),
};
beforeEach(() => {
  buttons.length = 0;
  vi.clearAllMocks();
  useQuery.mockReturnValue([
    [
      {
        entries: [
          {
            userId: "me",
            entryOn: "2026-10-14",
            completed: false,
            note: "Ten minutes",
          },
        ],
      },
    ],
    { type: "complete" },
  ]);
});
describe("single habit history", () => {
  it("inspects a day without changing completion", () => {
    renderToStaticMarkup(
      <HabitDayPreview
        name="Read"
        date="2026-10-14"
        today={base.today}
        onInspect={base.onDate}
      />,
    );
    buttons[0]?.onClick?.();
    expect(base.onDate).toHaveBeenCalledOnce();
    expect(base.onCompleted).not.toHaveBeenCalled();
  });
  it("shows one month with explicit selected-day controls and a note-only entry", () => {
    const html = renderToStaticMarkup(
      <HabitHistory {...base} selectedDate="2026-10-14" />,
    );
    expect(html.match(/<table/g)).toHaveLength(1);
    expect(html).toContain("Details for Read on 2026-10-14");
    expect(html).toContain("Not recorded. Note: Ten minutes");
    expect(html).toContain("Note for Read on 2026-10-14");
    expect(html).toContain("Read, 2026-10-14. Mark done");
    expect(
      html.match(/<button[^>]*aria-label="Next month"[^>]*>/)?.[0],
    ).toContain('disabled=""');
    expect(
      html.match(/<button[^>]*aria-label="Read, 2026-10-16[^>]*>/)?.[0],
    ).toContain('disabled=""');
  });
  it.each([
    { own: false, archived: false },
    { own: true, archived: true },
    { own: true, archived: false, enabled: false },
  ])("never enables a day write when %o", (flags) => {
    const html = renderToStaticMarkup(
      <HabitHistory {...base} {...flags} selectedDate="2026-10-14" />,
    );
    expect(
      html.match(
        /<button[^>]*aria-label="Read, 2026-10-14. Mark done"[^>]*>/,
      )?.[0],
    ).toContain('disabled=""');
    if (!flags.own || flags.archived) {
      expect(html).not.toContain("<textarea");
      expect(html).toContain("Ten minutes");
    }
  });
  it("locks identity-changing controls while a note draft is pending or rejected", () => {
    const html = renderToStaticMarkup(
      <HabitHistory {...base} locked selectedDate="2026-10-14" />,
    );
    expect(
      html.match(/<button[^>]*aria-label="Previous month"[^>]*>/)?.[0],
    ).toContain('disabled=""');
    expect(html).toContain("Note for Read on 2026-10-14");
  });
  it("does not show selected-day editors until the scoped history is complete", () => {
    useQuery.mockReturnValue([[], { type: "unknown" }]);
    expect(
      renderToStaticMarkup(
        <HabitHistory {...base} selectedDate="2026-10-14" />,
      ),
    ).not.toContain("<textarea");
  });
  it("shows errors instead of editable empty history", () => {
    useQuery.mockReturnValue([[], { type: "error" }]);
    const html = renderToStaticMarkup(
      <HabitHistory {...base} selectedDate="2026-10-14" />,
    );
    expect(html).toContain("Unable to load history");
    expect(html).not.toContain("<textarea");
  });
  it.each(["2024-02-01", "2025-02-01", "2026-12-01", "2027-01-01"])(
    "lays out all actual dates once, Monday-first (%s)",
    (anchor) => {
      const dates = habitMonth(anchor).dates,
        weeks = monthCalendarWeeks(dates);
      expect(weeks.flat().filter(Boolean)).toEqual(dates);
      expect(weeks.every((w) => w.length === 7)).toBe(true);
      expect(weeks[0]?.indexOf(dates[0] ?? null)).toBe(
        (new Date(`${anchor}T12:00:00Z`).getUTCDay() + 6) % 7,
      );
    },
  );
});
