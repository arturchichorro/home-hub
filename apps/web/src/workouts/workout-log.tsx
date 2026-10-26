import type { WorkoutExercise } from "@home-hub/shared/workouts";
import { workoutSetValuesFromRow } from "@home-hub/shared/workouts";
import type {
  WorkoutLog as LogRow,
  WorkoutLogSet,
} from "@home-hub/shared/zero/schema";
import { Check, IconButton, Input, X } from "@home-hub/ui-web";
import {
  setInputKey,
  type WorkoutLogForm,
  type WorkoutSetInput,
} from "./workout-log-form";
export type WorkoutLog = LogRow & { readonly sets: readonly WorkoutLogSet[] };
export function WorkoutLogActions({
  disabled,
  onComplete,
  onCancel,
}: {
  disabled: boolean;
  onComplete: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2" data-log-actions>
      <IconButton
        aria-label="Save log"
        title="Save log"
        className="size-7!"
        disabled={disabled}
        onClick={onComplete}
      >
        <Check aria-hidden="true" className="size-4" />
      </IconButton>
      <IconButton
        aria-label="Cancel log"
        title="Cancel log"
        className="size-7!"
        onClick={onCancel}
      >
        <X aria-hidden="true" className="size-4" />
      </IconButton>
    </div>
  );
}
export type WorkoutLogging = {
  form: WorkoutLogForm;
  previous: readonly WorkoutLog[];
  onChange: (
    exerciseId: string,
    round: number,
    patch: Partial<WorkoutSetInput>,
  ) => void;
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
  const { form, previous, onChange } = logging;
  const old = previous.find(
    (log) =>
      log.id !== form.id &&
      log.completedAt < (form.completedAt ?? Date.now()) &&
      log.sets.some((s) => s.workoutExerciseId === exercise.id),
  );
  return (
    <div className="py-1">
      {Array.from({ length: exercise.sets }, (_, i) => i + 1).map((round) => {
        const input = form.inputs[setInputKey(exercise.id, round)] ?? {
          weightKg: "",
          amount: "",
          rightAmount: "",
        };
        const prior = old?.sets.find(
          (s) => s.workoutExerciseId === exercise.id && s.round === round,
        );
        const last = prior ? workoutSetValuesFromRow(prior) : undefined;
        const label = `${exercise.name}, set ${round}`;
        return (
          <div key={round}>
            <fieldset
              aria-label={`Log ${label}`}
              disabled={disabled}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1 text-xs text-muted"
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
                    placeholder={input.amount || "—"}
                    title="Blank uses the left-side value"
                    value={input.rightAmount}
                    onValueChange={(rightAmount) =>
                      onChange(exercise.id, round, { rightAmount })
                    }
                  />
                  <span>{exercise.unit}</span>
                </div>
              )}
            </fieldset>
            {last && (
              <p className="pb-1 text-xs text-muted">
                Previous: {last.amount}
                {last.rightAmount !== null ? ` / ${last.rightAmount}` : ""}{" "}
                {exercise.unit}
                {last.weightKg !== null ? ` · ${last.weightKg} kg` : ""}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
