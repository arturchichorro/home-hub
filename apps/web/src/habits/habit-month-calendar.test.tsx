import { habitPeriod } from "@home-hub/shared/habits";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  HabitMonthCalendar,
  habitMemberColor,
  monthCalendarWeeks,
} from "./habit-month-calendar";

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
  dates: habitPeriod("2026-10-15", "month").dates,
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
      const dates = habitPeriod(date, "month").dates;
      const weeks = monthCalendarWeeks(dates);
      expect(weeks.every((week) => week.length === 7)).toBe(true);
      expect(weeks.flat().filter(Boolean)).toEqual(dates);
    },
  );
  it("assigns repeatable account colors independently of calendar or roster order", () => {
    expect(habitMemberColor("alice")).toBe(habitMemberColor("alice"));
    expect(habitMemberColor("alice")).not.toBe(habitMemberColor("bob"));
    expect(habitMemberColor("alice")).toContain(
      "var(--member-marker-lightness)",
    );
  });
});

describe("shared habit month", () => {
  it("renders one day cell for both members' Xs, not person rows", () => {
    const html = renderToStaticMarkup(<HabitMonthCalendar {...props} />);
    expect(html.match(/aria-pressed=/g)).toHaveLength(31);
    expect(html).toContain(
      "Read, 2026-10-14. Completed by: Alice, Bob. Your completion: recorded.",
    );
    expect(html).toContain(habitMemberColor("alice"));
    expect(html).toContain(habitMemberColor("bob"));
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
