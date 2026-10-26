import {
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
  type Sensors,
} from "@dnd-kit/dom";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { Dumbbell } from "@home-hub/ui-web";
import { Link } from "@tanstack/react-router";

type Workout = { id: string; householdId: string; title: string };
// Same gestures as Lists: mouse movement, touch hold, Space/arrow keys.
const pointerSensor = PointerSensor.configure({
  activationConstraints(event) {
    if (event.pointerType === "mouse")
      return [new PointerActivationConstraints.Distance({ value: 5 })];
    if (event.pointerType === "touch")
      return [
        new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 }),
      ];
    return [
      new PointerActivationConstraints.Delay({ value: 200, tolerance: 10 }),
      new PointerActivationConstraints.Distance({ value: 5 }),
    ];
  },
});
const keyboardSensor = KeyboardSensor.configure({
  keyboardCodes: {
    start: ["Space"],
    cancel: ["Escape"],
    end: ["Space", "Enter", "Tab"],
    up: ["ArrowUp"],
    down: ["ArrowDown"],
    left: ["ArrowLeft"],
    right: ["ArrowRight"],
  },
});
export function workoutOrderingSensors(defaults: Sensors): Sensors {
  return [
    ...defaults.filter(
      (sensor) => sensor !== PointerSensor && sensor !== KeyboardSensor,
    ),
    pointerSensor,
    keyboardSensor,
  ];
}
export function reorderedWorkoutIds(
  workouts: readonly { id: string }[],
  from: number,
  to: number,
) {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= workouts.length ||
    to >= workouts.length
  )
    return undefined;
  const ids = workouts.map((w) => w.id);
  const [workoutId] = ids.splice(from, 1);
  if (!workoutId) return undefined;
  ids.splice(to, 0, workoutId);
  return { workoutId, orderedWorkoutIds: ids };
}
export function WorkoutList({
  workouts,
  disabled,
  onMove,
}: {
  workouts: readonly Workout[];
  disabled: boolean;
  onMove: (workoutId: string, orderedWorkoutIds: string[]) => void;
}) {
  return (
    <DragDropProvider
      sensors={workoutOrderingSensors}
      onDragEnd={(event) => {
        const source = event.operation.source;
        if (disabled || event.canceled || !isSortable(source)) return;
        const move = reorderedWorkoutIds(
          workouts,
          source.initialIndex,
          source.index,
        );
        if (move) onMove(move.workoutId, move.orderedWorkoutIds);
      }}
    >
      <ul className="min-w-0 divide-y divide-border">
        {workouts.map((workout, index) => (
          <WorkoutRow
            key={workout.id}
            workout={workout}
            index={index}
            disabled={disabled}
          />
        ))}
      </ul>
    </DragDropProvider>
  );
}
export function WorkoutRow({
  workout,
  index,
  disabled,
}: {
  workout: Workout;
  index: number;
  disabled: boolean;
}) {
  const sortable = useSortable({
    id: workout.id,
    index,
    type: "household-workout",
    accept: "household-workout",
    disabled,
  });
  return (
    <li
      ref={sortable.ref}
      className={`min-w-0 ${sortable.isDragging ? "opacity-60" : ""}`}
    >
      <Link
        ref={sortable.handleRef}
        to="/households/$householdId/workouts/$workoutId"
        params={{ householdId: workout.householdId, workoutId: workout.id }}
        preload="intent"
        draggable={false}
        className="flex min-h-10 min-w-0 touch-pan-y select-none items-center gap-3 py-2 font-medium outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <Dumbbell aria-hidden="true" className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 break-words">{workout.title}</span>
      </Link>
    </li>
  );
}
