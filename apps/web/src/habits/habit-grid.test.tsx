import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HabitGrid, reorderedHabitIds } from "./habit-grid";

type DragEvent = {
  canceled: boolean;
  operation: { source: { initialIndex: number; index: number } | null };
};
const { provider } = vi.hoisted(() => ({
  provider:
    vi.fn<
      (props: {
        onDragEnd: (event: DragEvent) => void;
        children: ReactNode;
      }) => void
    >(),
}));
vi.mock("@dnd-kit/react", () => ({
  DragDropProvider: (props: Parameters<typeof provider>[0]) => {
    provider(props);
    return props.children;
  },
}));
vi.mock("@dnd-kit/react/sortable", () => ({
  isSortable: (source: unknown) => source != null,
  useSortable: () => ({ ref: vi.fn(), handleRef: vi.fn(), isDragging: false }),
}));
const habits = [
  { id: "a", name: "Read", completions: [] },
  { id: "b", name: "Walk", completions: [] },
  { id: "c", name: "Stretch", completions: [] },
];
const onMove = vi.fn();
function render(disabled = false, archived = false) {
  return renderToStaticMarkup(
    <HabitGrid
      habits={habits}
      disabled={disabled}
      archived={archived}
      loading={false}
      onMove={onMove}
    >
      {(habit, handle) => (
        <div>
          {handle}
          {habit.name}
        </div>
      )}
    </HabitGrid>,
  );
}
function drag(canceled = false, from = 0, to = 2) {
  const options = provider.mock.calls[0]?.[0];
  if (!options) throw new Error("Missing provider");
  options.onDragEnd({
    canceled,
    operation: { source: { initialIndex: from, index: to } },
  });
}
beforeEach(() => vi.clearAllMocks());

describe("habit reordering", () => {
  it("fits more columns and lets calendars fill the available track width", () => {
    const html = render();
    expect(html).toContain("repeat(auto-fill,minmax(min(100%,20rem),1fr))");
    expect(html).not.toContain("24rem");
    expect(html).not.toContain("max-w-sm");
  });
  it("moves a habit without dropping or duplicating any IDs", () => {
    expect(reorderedHabitIds(habits, 0, 2)).toEqual({
      habitId: "a",
      orderedHabitIds: ["b", "c", "a"],
    });
    expect(reorderedHabitIds(habits, 2, 0)).toEqual({
      habitId: "c",
      orderedHabitIds: ["c", "a", "b"],
    });
    expect(habits.map((habit) => habit.id)).toEqual(["a", "b", "c"]);
  });
  it.each([
    [0, 0],
    [-1, 0],
    [0, -1],
    [3, 0],
    [0, 3],
  ])("ignores invalid/no-op movement %s → %s", (from, to) => {
    expect(reorderedHabitIds(habits, from, to)).toBeUndefined();
  });
  it("exposes dedicated handles so calendar clicks and name editing aren't drag targets", () => {
    const html = render();
    expect(html).toContain('aria-label="Reorder Read"');
    expect(html).toContain('aria-label="Reorder Walk"');
    drag();
    expect(onMove).toHaveBeenCalledWith("a", ["b", "c", "a"]);
  });
  it.each(["canceled", "disabled", "unchanged"])(
    "doesn't persist a %s drag",
    (reason) => {
      render(reason === "disabled");
      drag(reason === "canceled", 0, reason === "unchanged" ? 0 : 2);
      expect(onMove).not.toHaveBeenCalled();
    },
  );
  it("does not offer reorder handles for archived habits", () => {
    expect(render(true, true)).not.toContain('aria-label="Reorder');
  });
});
