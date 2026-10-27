import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatLastDoneDate,
  reorderedWorkoutIds,
  WorkoutList,
} from "./workout-list";

type DragEvent = {
  canceled: boolean;
  operation: { source: { initialIndex: number; index: number } | null };
};
const { provider, sortable } = vi.hoisted(() => ({
  provider:
    vi.fn<
      (props: {
        onDragEnd: (event: DragEvent) => void;
        children: ReactNode;
      }) => void
    >(),
  sortable: vi.fn(),
}));
vi.mock("@dnd-kit/react", () => ({
  DragDropProvider: (props: Parameters<typeof provider>[0]) => {
    provider(props);
    return props.children;
  },
}));
vi.mock("@dnd-kit/react/sortable", () => ({
  isSortable: (source: unknown) => source != null,
  useSortable: (options: unknown) => {
    sortable(options);
    return { ref: vi.fn(), handleRef: vi.fn(), isDragging: false };
  },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    className,
    draggable,
  }: {
    children: ReactNode;
    params: { workoutId: string };
    className: string;
    draggable: boolean;
  }) => (
    <a
      href={`/workouts/${params.workoutId}`}
      className={className}
      draggable={draggable}
    >
      {children}
    </a>
  ),
}));
const workouts = ["A", "B", "C"].map((id) => ({
  id,
  householdId: "home",
  title: `Workout ${id}`,
}));
const onMove = vi.fn();
function render(disabled = false) {
  return renderToStaticMarkup(
    <WorkoutList workouts={workouts} disabled={disabled} onMove={onMove} />,
  );
}
function drag(canceled = false, from = 0, to = 2) {
  const props = provider.mock.calls[0]?.[0];
  if (!props) throw new Error("provider");
  props.onDragEnd({
    canceled,
    operation: { source: { initialIndex: from, index: to } },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());
describe("last completed workout", () => {
  it("shows a subdued right-hand date including weekday inside the existing row link", () => {
    const html = renderToStaticMarkup(
      <WorkoutList
        workouts={[
          {
            ...workouts[0],
            id: "A",
            householdId: "home",
            title: "Workout A",
            logs: [{ completedOn: "2026-06-17" }],
          },
        ]}
        disabled={false}
        onMove={onMove}
      />,
    );
    expect(html).toContain('dateTime="2026-06-17"');
    expect(html).toContain("Last done Wed, 17 June");
    expect(html).toContain("text-right");
    expect(html).toContain("text-muted");
    expect(html).toMatch(/<a[^>]*>.*<time.*<\/time><\/a>/);
    expect(html).not.toContain("<button");
  });
  it("leaves never-logged rows uncluttered", () => {
    expect(render()).not.toContain("<time");
    expect(render()).not.toContain("Last done");
  });
  it("includes the year for older logs and never shifts the calendar day with timezone", () => {
    expect(
      formatLastDoneDate("2025-06-18", new Date("2026-10-27T12:00:00Z")),
    ).toBe("Wed, 18 June 2025");
    expect(
      formatLastDoneDate("2026-01-01", new Date("2026-10-27T12:00:00Z")),
    ).toBe("Thu, 1 January");
  });
  it.each(["", "invalid", "2026-02-30"])(
    "ignores malformed calendar dates: %s",
    (day) => {
      expect(formatLastDoneDate(day)).toBeUndefined();
    },
  );
});
describe("workout reordering", () => {
  it("reorders without mutating or dropping IDs", () => {
    expect(reorderedWorkoutIds(workouts, 0, 2)).toEqual({
      workoutId: "A",
      orderedWorkoutIds: ["B", "C", "A"],
    });
    expect(workouts.map((w) => w.id)).toEqual(["A", "B", "C"]);
  });
  it.each([
    [0, 0],
    [-1, 0],
    [0, -1],
    [3, 0],
    [0, 3],
  ])("ignores invalid movement %s → %s", (from, to) => {
    expect(reorderedWorkoutIds(workouts, from, to)).toBeUndefined();
  });
  it("keeps each whole row a navigation and drag target, like Lists", () => {
    const html = render();
    expect(html).toContain('href="/workouts/A"');
    expect(html).toContain('draggable="false"');
    expect(html).toContain("touch-pan-y");
    expect(html).not.toContain("<button");
    drag();
    expect(onMove).toHaveBeenCalledWith("A", ["B", "C", "A"]);
  });
  it.each(["canceled", "disabled", "unchanged"])(
    "does not persist a %s drag",
    (reason) => {
      render(reason === "disabled");
      drag(reason === "canceled", 0, reason === "unchanged" ? 0 : 2);
      expect(onMove).not.toHaveBeenCalled();
    },
  );
  it("disables sorting offline while preserving navigation", () => {
    expect(render(true)).toContain('href="/workouts/A"');
    expect(sortable).toHaveBeenCalledWith(
      expect.objectContaining({ disabled: true, type: "household-workout" }),
    );
  });
});
