import { habitMonth } from "@home-hub/shared/habits";
import type { TooltipProps } from "@home-hub/ui-web";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HabitDay } from "./habit-calendar-shared";
import { habitMemberColors } from "./habit-member-mark";

const props = {
  habit: {
    id: "habit-1",
    name: "Read",
    completions: [
      { userId: "alice", completedOn: "2026-10-14" },
      { userId: "bob", completedOn: "2026-10-14" },
    ],
  },
  members: [
    { userId: "alice", user: { username: "Alice" } },
    { userId: "bob", user: { username: "Bob" } },
  ],
  currentUserId: "alice",
  dates: habitMonth("2026-10-15").dates,
  label: "October 2026",
  today: "2026-10-15",
  archived: false,
  enabled: true,
  pending: new Set<string>(),
  onSetCompleted: vi.fn(),
};
const colors = habitMemberColors(props.members.map((member) => member.userId));
function day(overrides: Partial<Parameters<typeof HabitDay>[0]> = {}) {
  const result = HabitDay({
    ...props,
    date: "2026-10-14",
    colors,
    ...overrides,
  }).props as TooltipProps;
  return {
    tooltip: result,
    button: result.trigger as ReactElement<{
      onClick: () => void;
      "aria-pressed": boolean;
    }>,
  };
}
beforeEach(() => vi.clearAllMocks());

describe("shared calendar day", () => {
  it("allows backfilling any past date without a creation cutoff", () => {
    day({ date: "1900-01-01" }).button.props.onClick();
    expect(props.onSetCompleted).toHaveBeenCalledWith("1900-01-01", true);
  });
  it("clicking a shared day toggles only the viewer's completion", () => {
    const { button } = day();
    expect(button.props["aria-pressed"]).toBe(true);
    button.props.onClick();
    expect(props.onSetCompleted).toHaveBeenCalledWith("2026-10-14", false);
  });
  it("can add your X to a day completed by someone else", () => {
    const { button } = day({ currentUserId: "charlie" });
    expect(button.props["aria-pressed"]).toBe(false);
    button.props.onClick();
    expect(props.onSetCompleted).toHaveBeenCalledWith("2026-10-14", true);
  });
  it("only shows fast tooltips when there are completions", () => {
    expect(day().tooltip.disabled).toBe(false);
    expect(day().tooltip.delay).toBe(200);
    expect(day({ date: "2026-10-15" }).tooltip.disabled).toBe(true);
  });
  it.each([
    { archived: true },
    { enabled: false },
    { date: "2026-10-16" },
    { pending: new Set(["habit-1:2026-10-14"]) },
    { pending: new Set(["habit-1"]) },
    { currentUserId: undefined },
  ])("rejects non-editable day clicks (%o)", (override) => {
    day(override).button.props.onClick();
    expect(props.onSetCompleted).not.toHaveBeenCalled();
  });
});
