import {
  type WorkoutExercise,
  type WorkoutSetValues,
  workoutContentSchema,
  workoutSetValuesSchema,
} from "@home-hub/shared/workouts";
import type {
  WorkoutLog as LogRow,
  WorkoutLogSet,
} from "@home-hub/shared/zero/schema";
import {
  ArrowLeft,
  Check,
  IconButton,
  InlineAlert,
  Input,
} from "@home-hub/ui-web";
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
export function WorkoutLogView({
  log,
  previous,
  disabled,
  onSave,
  onClose,
}: {
  log: WorkoutLog;
  previous: readonly WorkoutLog[];
  disabled: boolean;
  onSave: (
    exerciseId: string,
    round: number,
    values: WorkoutSetValues,
  ) => Promise<boolean>;
  onClose: () => void;
}) {
  const snapshot = workoutContentSchema.parse(log.snapshot);
  return (
    <section className="grid min-w-0 gap-4">
      <div className="flex items-center gap-2">
        <IconButton aria-label="Back to workout" onClick={onClose}>
          <ArrowLeft aria-hidden="true" className="size-4" />
        </IconButton>
        <h1 className="text-xl font-semibold text-primary">{snapshot.title}</h1>
        <span className="ml-auto text-xs text-muted">
          {log.completedOn ?? new Date(log.createdAt ?? 0).toLocaleDateString()}
          {log.status === "completed"
            ? " · Done"
            : log.status === "abandoned"
              ? " · Abandoned"
              : ""}
        </span>
      </div>
      {snapshot.notes && (
        <details>
          <summary className="cursor-pointer py-1 text-sm text-muted">
            Notes
          </summary>
          <p className="whitespace-pre-line py-2 text-sm text-muted">
            {snapshot.notes}
          </p>
        </details>
      )}
      <div className="divide-y divide-border">
        {snapshot.exercises.map((exercise) => {
          const old = previous.find(
            (p) =>
              p.id !== log.id &&
              p.status === "completed" &&
              (p.completedAt ?? 0) < (log.completedAt ?? log.createdAt ?? 0) &&
              p.sets.some((s) => s.exerciseId === exercise.id),
          );
          return (
            <section key={exercise.id} className="py-3">
              <h2 className="text-sm font-medium">
                {exercise.name}{" "}
                <span className="font-normal text-muted">
                  · {exercise.target} {exercise.unit}
                  {exercise.unilateral ? " each side" : ""}
                </span>
              </h2>
              {Array.from({ length: exercise.sets }, (_, i) => i + 1).map(
                (round) => {
                  const saved = log.sets.find(
                    (s) => s.exerciseId === exercise.id && s.round === round,
                  );
                  const prior = old?.sets.find(
                    (s) => s.exerciseId === exercise.id && s.round === round,
                  );
                  return (
                    <SetRow
                      key={round}
                      exercise={exercise}
                      round={round}
                      saved={
                        saved
                          ? workoutSetValuesSchema.parse(saved.values)
                          : undefined
                      }
                      previous={
                        prior
                          ? workoutSetValuesSchema.parse(prior.values)
                          : undefined
                      }
                      disabled={disabled || log.status === "abandoned"}
                      onSave={(values) => onSave(exercise.id, round, values)}
                    />
                  );
                },
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
