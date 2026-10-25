import {
  type WorkoutExercise,
  type WorkoutSetValues,
  workoutSetValuesSchema,
} from "@home-hub/shared/workouts";
import type {
  WorkoutLog as LogRow,
  WorkoutLogSet,
} from "@home-hub/shared/zero/schema";
import { Check, IconButton, InlineAlert, Input } from "@home-hub/ui-web";
import { useEffect, useState } from "react";
export type WorkoutLog = LogRow & { readonly sets: readonly WorkoutLogSet[] };
function SetRow({
  exercise,
  round,
  saved,
  previous,
  disabled,
  onSave,
}: {
  exercise: WorkoutExercise;
  round: number;
  saved?: WorkoutSetValues | undefined;
  previous?: WorkoutSetValues | undefined;
  disabled: boolean;
  onSave: (values: WorkoutSetValues) => Promise<boolean>;
}) {
  const [values, setValues] = useState<WorkoutSetValues>(
    () =>
      saved ?? {
        weightKg:
          exercise.load === "bodyweight" ? null : (previous?.weightKg ?? null),
        amount: previous?.amount ?? (Number.parseInt(exercise.target, 10) || 1),
        rightAmount: previous?.rightAmount ?? null,
      },
  );
  const [dirty, setDirty] = useState(!saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const savedJson = saved ? JSON.stringify(saved) : undefined;
  useEffect(() => {
    if (!dirty && savedJson)
      setValues(workoutSetValuesSchema.parse(JSON.parse(savedJson)));
  }, [dirty, savedJson]);
  function patch(p: Partial<WorkoutSetValues>) {
    setDirty(true);
    setValues((v) => ({ ...v, ...p }));
  }
  const label = `${exercise.name}, set ${round}`;
  return (
    <form
      aria-label={`Log ${label}`}
      onSubmit={async (event) => {
        event.preventDefault();
        const parsed = workoutSetValuesSchema.safeParse(values);
        if (!parsed.success) {
          setError("Check weight and repetitions/time.");
          return;
        }
        setBusy(true);
        setError("");
        try {
          if (await onSave(parsed.data)) setDirty(false);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset
        disabled={disabled || busy}
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
              value={values.weightKg ?? ""}
              placeholder="—"
              onValueChange={(v) =>
                patch({ weightKg: v === "" ? null : Number(v) })
              }
            />
            <span>kg{exercise.load === "per-hand" ? "/hand" : ""}</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <Input
            appearance="seamless"
            aria-label={`${exercise.unit} for ${label}`}
            className="h-8! w-12 flex-none! text-sm"
            type="number"
            min="0"
            max="600"
            required
            value={values.amount}
            onValueChange={(v) => patch({ amount: Number(v) })}
          />
          <span>
            {exercise.unit}
            {exercise.unilateral ? " left" : ""}
          </span>
        </div>
        {exercise.unilateral && (
          <div className="flex items-center gap-1">
            <Input
              appearance="seamless"
              aria-label={`${exercise.unit} right for ${label}`}
              className="h-8! w-12 flex-none! text-sm"
              type="number"
              min="0"
              max="600"
              placeholder="Same"
              value={values.rightAmount ?? ""}
              onValueChange={(v) =>
                patch({ rightAmount: v === "" ? null : Number(v) })
              }
            />
            <span>right</span>
          </div>
        )}
        <IconButton
          type="submit"
          aria-label={dirty ? `Save ${label}` : `${label} saved`}
          title={dirty ? "Save set" : "Saved"}
          className={`ml-auto size-8! ${!dirty ? "text-primary" : ""}`}
          disabled={!dirty || disabled || busy}
        >
          <Check aria-hidden="true" className="size-4" />
        </IconButton>
      </fieldset>
      {previous && (
        <p className="pb-1 text-xs text-muted">
          Previous: {previous.amount}
          {previous.rightAmount !== null ? ` / ${previous.rightAmount}` : ""}{" "}
          {exercise.unit}
          {previous.weightKg !== null ? ` · ${previous.weightKg} kg` : ""}
        </p>
      )}
      {error && (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      )}
    </form>
  );
}
export type WorkoutLogging = {
  log: WorkoutLog;
  previous: readonly WorkoutLog[];
  onSave: (
    exerciseId: string,
    round: number,
    values: WorkoutSetValues,
  ) => Promise<boolean>;
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
  const { log, previous, onSave } = logging;
  const old = previous.find(
    (p) =>
      p.id !== log.id &&
      p.status === "completed" &&
      (p.completedAt ?? 0) < (log.completedAt ?? log.createdAt ?? 0) &&
      p.sets.some((s) => s.exerciseId === exercise.id),
  );
  return (
    <div className="py-1">
      {Array.from({ length: exercise.sets }, (_, i) => i + 1).map((round) => {
        const saved = log.sets.find(
          (s) => s.exerciseId === exercise.id && s.round === round,
        );
        const prior = old?.sets.find(
          (s) => s.exerciseId === exercise.id && s.round === round,
        );
        return (
          <SetRow
            key={`${log.id}:${round}`}
            exercise={exercise}
            round={round}
            saved={
              saved ? workoutSetValuesSchema.parse(saved.values) : undefined
            }
            previous={
              prior ? workoutSetValuesSchema.parse(prior.values) : undefined
            }
            disabled={disabled || log.status === "abandoned"}
            onSave={(values) => onSave(exercise.id, round, values)}
          />
        );
      })}
    </div>
  );
}
