import type { WorkoutExercise } from "@home-hub/shared/workouts";
import { workoutSetValuesFromRow } from "@home-hub/shared/workouts";
import type {
  WorkoutLog as LogRow,
  WorkoutLogSet,
} from "@home-hub/shared/zero/schema";
import {
  Button,
  ConfirmationPopover,
  IconButton,
  Input,
  Plus,
  Trash2,
  X,
} from "@home-hub/ui-web";
import { useRef } from "react";
import type { WorkoutEditorState } from "./workout-log-editor";
import {
  completeSetValues,
  exerciseRounds,
  nextExerciseRound,
  setInputKey,
  type WorkoutLogForm,
  type WorkoutSetInput,
} from "./workout-log-form";
import type { ExercisePerformance } from "./workout-log-projection";

export type WorkoutLog = LogRow & {
  readonly sets: readonly WorkoutLogSet[];
  readonly exerciseLogIds?: Readonly<Record<string, string>>;
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
  onAddSet: (exerciseId: string) => void;
  onRemoveSet: (exerciseId: string, round: number) => void;
};
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
  const { form, state, onChange, onFlush } = logging;
  const nextRound = nextExerciseRound(exercise, form.inputs);
  const rounds = exerciseRounds(exercise, form.inputs);
  const old = exercise.catalogExerciseId
    ? logging.previous.get(exercise.catalogExerciseId)
    : undefined;
  const complete = rounds
    .map((round) =>
      completeSetValues(exercise, form.inputs[setInputKey(exercise.id, round)]),
    )
    .every(Boolean);
  return (
    <div ref={container} className="py-1">
      {rounds.map((round) => {
        const key = setInputKey(exercise.id, round);
        const input = form.inputs[key] ?? {
          weightKg: "",
          amount: "",
          rightAmount: "",
        };
        const prior = old?.sets.find(
          (s) =>
            s.round === round &&
            s.unit === exercise.unit &&
            s.load === exercise.load &&
            s.unilateral === exercise.unilateral,
        );
        const last = prior ? workoutSetValuesFromRow(prior) : undefined;
        const label = `${exercise.name}, set ${round}`;
        const saving = state.saving.has(key),
          error = state.errors[key];
        const removable =
          state.recorded.has(key) ||
          round > exercise.sets ||
          Object.values(input).some((value) => value !== "");
        const remove = (
          <IconButton
            aria-label={`Remove ${label}`}
            title="Remove set"
            className="size-7!"
            disabled={disabled || state.deleting.has(key)}
            onClick={
              state.recorded.has(key)
                ? undefined
                : () => logging.onRemoveSet(exercise.id, round)
            }
          >
            <Trash2 aria-hidden="true" className="size-3.5" />
          </IconButton>
        );
        return (
          <div key={round} data-round={round}>
            <fieldset
              aria-label={`Log ${label}`}
              aria-busy={saving || undefined}
              disabled={disabled || state.deleting.has(key)}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1 text-xs text-muted"
              onBlurCapture={(event) => {
                if (
                  !event.currentTarget.contains(
                    event.relatedTarget as Node | null,
                  )
                )
                  onFlush(exercise.id, round);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onFlush(exercise.id, round);
                }
              }}
            >
              <span className="w-10">Set {round}</span>
              {exercise.load !== "bodyweight" && (
                <div className="flex items-center gap-1">
                  <Input
                    appearance="seamless"
                    aria-label={`Weight in kg for ${label}`}
                    className="h-8! w-14 flex-none! text-sm"
                    type="number"
                    min="0"
                    max="1000"
                    step="0.01"
                    required
                    value={input.weightKg}
                    placeholder={last?.weightKg?.toString() ?? "—"}
                    onValueChange={(weightKg) =>
                      onChange(exercise.id, round, { weightKg })
                    }
                  />
                  <span>kg{exercise.load === "per-hand" ? "/hand" : ""}</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                {exercise.unilateral && <span>Left</span>}
                <Input
                  appearance="seamless"
                  aria-label={`${exercise.unilateral ? "Left " : ""}${exercise.unit} for ${label}`}
                  className="h-8! w-12 flex-none! text-sm"
                  type="number"
                  min="0"
                  max="600"
                  required
                  value={input.amount}
                  placeholder={last?.amount.toString() ?? "—"}
                  onValueChange={(amount) =>
                    onChange(exercise.id, round, { amount })
                  }
                />
                <span>{exercise.unit}</span>
              </div>
              {exercise.unilateral && (
                <div className="flex items-center gap-1">
                  <span>Right</span>
                  <Input
                    appearance="seamless"
                    aria-label={`Right ${exercise.unit} for ${label}`}
                    className="h-8! w-12 flex-none! text-sm"
                    type="number"
                    min="0"
                    max="600"
                    required
                    value={input.rightAmount}
                    placeholder={
                      last ? (last.rightAmount ?? last.amount).toString() : "—"
                    }
                    onValueChange={(rightAmount) =>
                      onChange(exercise.id, round, { rightAmount })
                    }
                  />
                  <span>{exercise.unit}</span>
                </div>
              )}
              <span className="text-xs text-muted" role="status">
                {saving
                  ? "Saving…"
                  : completeSetValues(exercise, input)
                    ? state.dirty.has(key)
                      ? "Unsaved"
                      : "Saved"
                    : state.dirty.has(key)
                      ? "Incomplete"
                      : ""}
              </span>
              {removable &&
                (state.recorded.has(key) ? (
                  <ConfirmationPopover
                    trigger={remove}
                    message="Remove this recorded set?"
                    confirmLabel="Remove"
                    onConfirm={() => logging.onRemoveSet(exercise.id, round)}
                  />
                ) : (
                  remove
                ))}
            </fieldset>
            {last && (
              <p className="pb-1 text-xs text-muted">
                Previous: {last.amount}
                {last.rightAmount !== null
                  ? ` / ${last.rightAmount}`
                  : exercise.unilateral
                    ? ` / ${last.amount}`
                    : ""}{" "}
                {exercise.unit}
                {last.weightKg !== null ? ` · ${last.weightKg} kg` : ""}
              </p>
            )}
            {error && (
              <p role="alert" className="text-xs text-danger">
                {error}
                <Button
                  size="compact"
                  variant="ghost"
                  disabled={disabled || saving}
                  onClick={() => onFlush(exercise.id, round)}
                >
                  Retry
                </Button>
              </p>
            )}
          </div>
        );
      })}
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
