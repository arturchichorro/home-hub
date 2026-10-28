import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { GripVertical, IconButton } from "@home-hub/ui-web";
import { type ReactNode, useState } from "react";
import { useBlockAppUpdate } from "../updates/activity";
import { workoutOrderingSensors } from "../workouts/workout-list";
import type { HabitRow } from "./habit-days";

type Habit = HabitRow;
export function reorderedHabitIds(
  habits: readonly { id: string }[],
  from: number,
  to: number,
) {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= habits.length ||
    to >= habits.length
  )
    return undefined;
  const ids = habits.map((habit) => habit.id);
  const [habitId] = ids.splice(from, 1);
  if (!habitId) return undefined;
  ids.splice(to, 0, habitId);
  return { habitId, orderedHabitIds: ids };
}

function SortableHabit({
  habit,
  index,
  disabled,
  showHandle,
  children,
}: {
  habit: Habit;
  index: number;
  disabled: boolean;
  showHandle: boolean;
  children: (handle: ReactNode) => ReactNode;
}) {
  const sortable = useSortable({
    id: habit.id,
    index,
    type: "household-habit",
    accept: "household-habit",
    disabled,
  });
  return (
    <section
      ref={sortable.ref}
      aria-label={habit.name}
      className={`grid w-full min-w-0 gap-0 border-b border-border py-1 ${sortable.isDragging ? "opacity-60" : ""}`}
    >
      {children(
        showHandle ? (
          <IconButton
            ref={sortable.handleRef}
            aria-label={`Reorder ${habit.name}`}
            disabled={disabled}
            className="size-11! shrink-0 touch-none cursor-grab active:cursor-grabbing"
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </IconButton>
        ) : null,
      )}
    </section>
  );
}

export function HabitGrid({
  habits,
  disabled,
  archived,
  loading,
  onMove,
  children,
}: {
  habits: readonly Habit[];
  disabled: boolean;
  archived: boolean;
  loading: boolean;
  onMove: (habitId: string, orderedHabitIds: string[]) => void;
  children: (habit: Habit, handle: ReactNode) => ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  useBlockAppUpdate(dragging);
  return (
    <DragDropProvider
      sensors={workoutOrderingSensors}
      onDragStart={() => setDragging(true)}
      onDragEnd={(event) => {
        setDragging(false);
        const source = event.operation.source;
        if (disabled || event.canceled || !isSortable(source)) return;
        const move = reorderedHabitIds(
          habits,
          source.initialIndex,
          source.index,
        );
        if (move) onMove(move.habitId, move.orderedHabitIds);
      }}
    >
      <div className="grid min-w-0 items-start" aria-busy={loading}>
        {habits.map((habit, index) => (
          <SortableHabit
            key={habit.id}
            habit={habit}
            index={index}
            disabled={disabled}
            showHandle={!archived}
          >
            {(handle) => children(habit, handle)}
          </SortableHabit>
        ))}
      </div>
    </DragDropProvider>
  );
}
