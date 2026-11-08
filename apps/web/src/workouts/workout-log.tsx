import type {
  CatalogExercise,
  WorkoutExercise,
} from "@home-hub/shared/workouts";
import { workoutSetValuesFromRow } from "@home-hub/shared/workouts";
import type { TrainingSessionSet } from "@home-hub/shared/zero/schema";
import {
  Button,
  ConfirmationPopover,
  History,
  IconButton,
  Input,
  Plus,
  Trash2,
  X,
} from "@home-hub/ui-web";
import type { ReadonlyJSONValue } from "@rocicorp/zero";
import { useId, useRef } from "react";
import type { ExercisePerformance } from "./training-log-projection";
import type { WorkoutEditorState } from "./workout-log-editor";
import {
  completeSetValues,
  exerciseForSet,
  exerciseRounds,
  nextExerciseRound,
  setInputErrors,
  setInputKey,
  type WorkoutLogForm,
  type WorkoutSetInput,
} from "./workout-log-form";

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
  const remove = () => logging.onRemoveExercise?.(exercise.id);
  const recorded = [...logging.state.recorded, ...logging.state.dirty].some(
    (key) => key.startsWith(`${exercise.id}:`),
  );
  const trigger = (
    <IconButton
      aria-label={`Remove ${exercise.name} from this session`}
      title="Remove exercise"
      className="size-7!"
      disabled={
        disabled ||
        logging.state.saving.size > 0 ||
        logging.state.deleting.size > 0
      }
      onClick={recorded ? undefined : remove}
    >
      <Trash2 aria-hidden="true" className="size-4" />
    </IconButton>
  );
  return recorded ? (
    <ConfirmationPopover
      trigger={trigger}
      message={`Remove ${exercise.name} and its sets from this log?`}
      confirmLabel="Remove exercise"
      onConfirm={remove}
    />
  ) : (
    trigger
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
  const validationId = useId();
  const { form, state, onChange, onFlush } = logging;
  const nextRound = nextExerciseRound(exercise, form.inputs);
  const rounds = exerciseRounds(exercise, form.inputs);
  const old = exercise.catalogExerciseId
    ? logging.previous.get(exercise.catalogExerciseId)
    : undefined;
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
      {rounds.map((round) => {
        const definition = exerciseForSet(exercise, form, round);
        const key = setInputKey(exercise.id, round);
        const input = form.inputs[key] ?? {
          weightKg: "",
          amount: "",
          rightAmount: "",
        };
        const validation = setInputErrors(definition, input);
        const invalid = Object.keys(validation).length > 0;
        const prior = old?.sets.find(
          (s) =>
            s.round === round &&
            s.unit === definition.unit &&
            s.load === definition.load &&
            s.unilateral === definition.unilateral,
        );
        const last = prior ? workoutSetValuesFromRow(prior) : undefined;
        const label = `${exercise.name}, set ${round}`;
        const saving = state.saving.has(key);
        const error = state.errors[key];
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
                ) {
                  onFlush(exercise.id, round);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onFlush(exercise.id, round);
                }
              }}
            >
              <span className="w-10">Set {round}</span>
              {definition.load !== "bodyweight" && (
                <div className="flex items-center gap-1">
                  <Input
                    appearance="seamless"
                    aria-label={`Weight in kg for ${label}`}
                    aria-invalid={Boolean(validation.weightKg) || undefined}
                    aria-errormessage={
                      validation.weightKg
                        ? `${validationId}-${round}-weightKg`
                        : undefined
                    }
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
                  <span>kg{definition.load === "per-hand" ? "/hand" : ""}</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                {definition.unilateral && <span>Left</span>}
                <Input
                  appearance="seamless"
                  aria-label={`${definition.unilateral ? "Left " : ""}${definition.unit} for ${label}`}
                  aria-invalid={Boolean(validation.amount) || undefined}
                  aria-errormessage={
                    validation.amount
                      ? `${validationId}-${round}-amount`
                      : undefined
                  }
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
                <span>{definition.unit}</span>
              </div>
              {definition.unilateral && (
                <div className="flex items-center gap-1">
                  <span>Right</span>
                  <Input
                    appearance="seamless"
                    aria-label={`Right ${definition.unit} for ${label}`}
                    aria-invalid={Boolean(validation.rightAmount) || undefined}
                    aria-errormessage={
                      validation.rightAmount
                        ? `${validationId}-${round}-rightAmount`
                        : undefined
                    }
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
                  <span>{definition.unit}</span>
                </div>
              )}
              <span className="text-xs text-muted" role="status">
                {saving
                  ? "Saving…"
                  : invalid
                    ? "Invalid"
                    : completeSetValues(definition, input)
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
            {Object.entries(validation).map(([field, message]) => (
              <p
                key={field}
                id={`${validationId}-${round}-${field}`}
                role="alert"
                className="text-xs text-danger"
              >
                {message}
              </p>
            ))}
            {last && (
              <p className="pb-1 text-xs text-muted">
                <span title="Previous performance">
                  <History
                    aria-hidden="true"
                    className="mr-1 inline size-3 align-[-1px]"
                  />
                  <span className="sr-only">Previous: </span>
                </span>
                {last.amount}
                {last.rightAmount !== null
                  ? ` / ${last.rightAmount}`
                  : definition.unilateral
                    ? ` / ${last.amount}`
                    : ""}{" "}
                {definition.unit}
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
