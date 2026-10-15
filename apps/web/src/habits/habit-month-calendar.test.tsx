import { habitMonth } from "@home-hub/shared/habits";
import type { TooltipProps } from "@home-hub/ui-web";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { habitMemberColor, habitMemberColors } from "./habit-member-mark";
import { HabitMonthCalendar, monthCalendarWeeks } from "./habit-month-calendar";

const { tooltipProps } = vi.hoisted(() => ({
  tooltipProps: vi.fn<(props: TooltipProps) => void>(),
}));
vi.mock("@home-hub/ui-web", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@home-hub/ui-web")>();
  return {
    ...actual,
    Tooltip: (props: TooltipProps) => {
      tooltipProps(props);
      return props.trigger;
    },
  };
});
beforeEach(() => vi.clearAllMocks());

const habit = {
  id: "habit-1",
  name: "Read",
  createdOn: "2026-10-13",
  completions: [
    { userId: "alice", completedOn: "2026-10-14" },
    { userId: "bob", completedOn: "2026-10-14" },
  ],
};
const props = {
  habit,
  members: [
    { userId: "alice", user: { username: "Alice" } },
    { userId: "bob", user: { username: "Bob" } },
    { userId: "charlie", user: { username: "Charlie" } },
  ],
  currentUserId: "alice",
  dates: habitMonth("2026-10-15").dates,
  today: "2026-10-15",
  label: "October 2026",
  archived: false,
  enabled: true,
  pending: new Set<string>(),
  onSetCompleted: vi.fn(),
};

describe("month calendar layout", () => {
  it("pads October with blank cells, not September/November day labels", () => {
    const weeks = monthCalendarWeeks(props.dates);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([
      null,
      null,
      null,
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(weeks[4]).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      null,
    ]);
    expect(weeks.flat().filter(Boolean)).toEqual(props.dates);
  });
  it.each(["2026-03-15", "2024-02-15", "2021-02-15"])(
    "handles six-row, leap and four-row months (%s)",
    (date) => {
      const dates = habitMonth(date).dates;
      const weeks = monthCalendarWeeks(dates);
      expect(weeks.every((week) => week.length === 7)).toBe(true);
      expect(weeks.flat().filter(Boolean)).toEqual(dates);
    },
  );
  it("assigns repeatable account colors independently of calendar or roster order", () => {
    expect(habitMemberColor("alice")).toBe(habitMemberColor("alice"));
    expect(habitMemberColor("alice")).not.toBe(habitMemberColor("bob"));
    expect(habitMemberColor("alice")).toContain("var(--color-member-");
  });
});

describe("member palette", () => {
  it("resolves color collisions and does not depend on roster order", () => {
    const ids = Array.from({ length: 12 }, (_, index) => `member-${index}`);
    const colors = habitMemberColors(ids);
    expect(new Set(colors.values()).size).toBe(ids.length);
    expect(habitMemberColors([...ids].reverse())).toEqual(colors);
  });
});

describe("shared habit month", () => {
  it("marks today with bold white text, not an orange circle", () => {
    const html = renderToStaticMarkup(<HabitMonthCalendar {...props} />);
    const today = html.match(/<span aria-current="date"[^>]*>/)?.[0];
    expect(today).toContain("font-bold text-foreground");
    expect(today).not.toContain("bg-primary");
    expect(today).not.toContain("rounded-full");
  });
  it("centers day numbers on the top line, with completion marks below", () => {
    const html = renderToStaticMarkup(<HabitMonthCalendar {...props} />);
    expect(html).toContain("flex w-full flex-col items-center gap-1");
    expect(html).toContain("[&amp;&gt;span]:items-start");
    expect(html).toContain("flex w-full flex-wrap justify-center");
  });
  it("fills its grid column while keeping compact day heights", () => {
    const html = renderToStaticMarkup(<HabitMonthCalendar {...props} />);
    expect(html).toContain("grid w-full min-w-0 gap-2");
    expect(html).not.toContain("max-w-sm");
    expect(html.match(/class="h-14 border/g)).toHaveLength(31);
    expect(html).not.toContain("sm:h-32");
    expect(html).not.toContain("h-24");
  });
  it("only enables tooltips for completed days and opens them after 200ms", () => {
    renderToStaticMarkup(<HabitMonthCalendar {...props} />);
    const tooltips = tooltipProps.mock.calls.map(([tooltip]) => tooltip);
    expect(tooltips).toHaveLength(31);
    const active = tooltips.filter((tooltip) => !tooltip.disabled);
    expect(active).toHaveLength(1);
    expect(active[0]?.delay).toBe(200);
    const content = renderToStaticMarkup(active[0]?.content);
    expect(content).toContain("Alice");
    expect(content).toContain("Bob");
    expect(content).not.toContain("No completions");
    expect(content).not.toContain("2026-10-14");
  });
  it("never enables a tooltip for a completely empty month", () => {
    renderToStaticMarkup(
      <HabitMonthCalendar {...props} habit={{ ...habit, completions: [] }} />,
    );
    expect(tooltipProps.mock.calls).toHaveLength(31);
    expect(tooltipProps.mock.calls.every(([tooltip]) => tooltip.disabled)).toBe(
      true,
    );
  });
  it("renders one day cell for both members' Xs, not person rows", () => {
    const html = renderToStaticMarkup(<HabitMonthCalendar {...props} />);
    expect(html.match(/aria-pressed=/g)).toHaveLength(31);
    expect(html).toContain(
      "Read, 2026-10-14. Completed by: Alice, Bob. Your completion: recorded.",
    );
    expect(html).toContain(habitMemberColor("alice"));
    expect(html).toContain(habitMemberColor("bob"));
    expect(html).toContain("lucide-x");
    expect(html).not.toMatch(/>X\s*</);
    expect(html).not.toContain('scope="row"');
    expect(html).not.toContain("2026-09-");
    expect(html).not.toContain("2026-11-");
    expect(html).toContain('aria-current="date"');
    expect(html).toContain('aria-label="Monthly completion totals"');
    expect(html).toContain("Alice (you): 1 day");
    expect(html).toContain("Bob: 1 day");
    expect(html).not.toContain("Charlie:");
  });
  it("always includes the current member's legend even with no entries", () => {
    const html = renderToStaticMarkup(
      <HabitMonthCalendar {...props} habit={{ ...habit, completions: [] }} />,
    );
    expect(html).toContain("Alice (you): 0 days");
    expect(html).not.toContain("Bob:");
    expect(html).toContain("No completions.");
  });
  it.each(["archived", "offline", "pending"])(
    "keeps day details focusable but non-editable when %s",
    (state) => {
      const html = renderToStaticMarkup(
        <HabitMonthCalendar
          {...props}
          archived={state === "archived"}
          enabled={state !== "offline"}
          pending={state === "pending" ? new Set([habit.id]) : new Set()}
        />,
      );
      const buttons = html.match(/<button[^>]*aria-pressed=[^>]*>/g) ?? [];
      expect(buttons).toHaveLength(31);
      expect(
        buttons.every((button) => button.includes('aria-disabled="true"')),
      ).toBe(true);
      expect(buttons.every((button) => !button.includes('tabindex="-1"'))).toBe(
        true,
      );
    },
  );
  it("blocks future and pre-creation dates without hiding their details", () => {
    const html = renderToStaticMarkup(<HabitMonthCalendar {...props} />);
    for (const date of ["2026-10-12", "2026-10-16"]) {
      const button = html.match(
        new RegExp(`<button[^>]*aria-label="Read, ${date}[^>]*>`),
      )?.[0];
      expect(button).toContain('aria-disabled="true"');
    }
    const todayButton = html.match(
      /<button[^>]*aria-label="Read, 2026-10-15[^>]*>/,
    )?.[0];
    expect(todayButton).toBeDefined();
    expect(todayButton).not.toContain('aria-disabled="true"');
  });
});
