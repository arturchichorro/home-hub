import type {
  CatalogExercise,
  WorkoutExercise,
} from "@home-hub/shared/workouts";
import type { TrainingSessionSet } from "@home-hub/shared/zero/schema";
import { Button, IconButton, Plus, X } from "@home-hub/ui-web";
import type { ReadonlyJSONValue } from "@rocicorp/zero";
import { useRef } from "react";
import { ExerciseRowActions } from "./exercise-row";
import type { ExercisePerformance } from "./training-log-projection";
import type { WorkoutEditorState } from "./workout-log-editor";
import {
  completeSetValues,
  exerciseForSet,
  exerciseRounds,
  nextExerciseRound,
  setInputKey,
  type WorkoutLogForm,
  type WorkoutSetInput,
} from "./workout-log-form";
import { WorkoutSetTable } from "./workout-set-table";

type WorkoutLogSet = Omit<TrainingSessionSet, "sessionExerciseId"> & {
  readonly logId: string;
  readonly householdId: string;
  readonly workoutExerciseId: string;
  readonly exerciseId: string;
};

export type WorkoutLog = {
  readonly id: string;
  readonly householdId: string;
  readonly userId: string;
  readonly workoutId?: string | null;
  readonly note: string | null;
  readonly completedOn: string;
  readonly completedAt: number;
  readonly createdAt: number | null;
  readonly snapshot: ReadonlyJSONValue;
  readonly sets: readonly WorkoutLogSet[];
  readonly sessionExerciseIds?: Readonly<Record<string, string>>;
  readonly logOnlyExerciseIds?: readonly string[];
};

export function WorkoutLogActions({ onClose }: { onClose: () => void }) {
  return (
    <IconButton
      aria-label="Close logging"
      title="Close logging"
      className="size-7!"
      onClick={onClose}
    >
      <X aria-hidden="true" className="size-4" />
    </IconButton>
  );
}

export type WorkoutLogging = {
  form: WorkoutLogForm;
  state: WorkoutEditorState;
  previous: ReadonlyMap<string, ExercisePerformance>;
  onChange: (
    exerciseId: string,
    round: number,
    patch: Partial<WorkoutSetInput>,
  ) => void;
  onFlush: (exerciseId: string, round: number) => void;
  onAddExercise: (exercise: CatalogExercise) => void;
  onRemoveExercise?: (exerciseId: string) => void;
  freeForm?: boolean;
  excludedExerciseIds?: readonly string[];
  onAddSet: (exerciseId: string) => void;
  onRemoveSet: (exerciseId: string, round: number) => void;
};

export function LoggedExerciseRemove({
  exercise,
  logging,
  disabled,
}: {
  exercise: WorkoutExercise;
  logging: WorkoutLogging;
  disabled: boolean;
}) {
  if (!logging.onRemoveExercise) {
    return null;
  }

  const recorded = [...logging.state.recorded, ...logging.state.dirty].some(
    (key) => key.startsWith(`${exercise.id}:`),
  );
  return (
    <ExerciseRowActions
      name={exercise.name}
      disabled={
        disabled ||
        logging.state.saving.size > 0 ||
        logging.state.deleting.size > 0
      }
      onRemove={() => {
        logging.onRemoveExercise?.(exercise.id);
        return true;
      }}
      removeLabel="Remove"
      confirmRemoval={recorded}
      message={`Remove ${exercise.name} and its sets from this log?`}
    />
  );
}

export function WorkoutExerciseSets({
  exercise,
  logging,
  disabled,
}: {
  exercise: WorkoutExercise;
  logging: WorkoutLogging;
  disabled: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const { form } = logging;
  const nextRound = nextExerciseRound(exercise, form.inputs);
  const rounds = exerciseRounds(exercise, form.inputs);
  const complete = rounds
    .map((round) =>
      completeSetValues(
        exerciseForSet(exercise, form, round),
        form.inputs[setInputKey(exercise.id, round)],
      ),
    )
    .every(Boolean);

  return (
    <div ref={container} className="py-1">
      <WorkoutSetTable
        exercise={exercise}
        rounds={rounds}
        logging={logging}
        disabled={disabled}
      />
      {complete && nextRound !== undefined && (
        <Button
          variant="ghost"
          size="compact"
          className="font-normal text-muted"
          aria-label={`Add set for ${exercise.name}`}
          disabled={disabled}
          onClick={() => {
            logging.onAddSet(exercise.id);
            requestAnimationFrame(() =>
              container.current
                ?.querySelector<HTMLInputElement>(
                  `[data-round="${nextRound}"] input`,
                )
                ?.focus(),
            );
          }}
        >
          <Plus aria-hidden="true" className="size-3.5" />
          Add set
        </Button>
      )}
    </div>
  );
}
