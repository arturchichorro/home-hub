import {
  progressionSuggestion,
  type WorkoutExercise,
  type WorkoutSetValues,
  workoutSetValuesSchema,
  workoutSnapshotSchema,
} from "@home-hub/shared/workouts";
import type {
  WorkoutSession as SessionRow,
  WorkoutSet,
} from "@home-hub/shared/zero/schema";
import {
  Button,
  Field,
  FieldControl as Input,
  FieldTextarea as Textarea,
} from "@home-hub/ui-web";
import { useEffect, useState } from "react";
export type Session = SessionRow & { readonly sets: readonly WorkoutSet[] };

function RestTimer() {
  const [deadline, setDeadline] = useState<number>();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!deadline) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [deadline]);
  const seconds = deadline
    ? Math.max(0, Math.ceil((deadline - now) / 1000))
    : undefined;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-border p-3">
      <span className="text-sm">Optional rest</span>
      {[45, 60, 75].map((s) => (
        <Button
          key={s}
          type="button"
          variant="secondary"
          onClick={() => {
            setNow(Date.now());
            setDeadline(Date.now() + s * 1000);
          }}
        >
          {s}s
        </Button>
      ))}
      {seconds !== undefined && (
        <>
          <span role="timer">
            {seconds ? `${seconds}s remaining` : "Rest finished"}
          </span>
          <Button variant="ghost" onClick={() => setDeadline(undefined)}>
            Clear
          </Button>
        </>
      )}
      <span className="text-sm text-muted">Take longer if needed.</span>
    </div>
  );
}
function SetForm({
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
  const initial = saved ?? {
    weightKg:
      exercise.load === "bodyweight" ? null : (previous?.weightKg ?? null),
    amount: exercise.min,
    rightAmount: null,
    rir: null,
    goodForm: false,
    skipped: false,
    note: "",
  };
  const [values, setValues] = useState<WorkoutSetValues>(initial);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(!saved);
  const savedJson = saved ? JSON.stringify(saved) : undefined;
  useEffect(() => {
    if (!dirty && savedJson)
      setValues(workoutSetValuesSchema.parse(JSON.parse(savedJson)));
  }, [dirty, savedJson]);
  function patch(p: Partial<WorkoutSetValues>) {
    setDirty(true);
    setValues((v) => ({ ...v, ...p }));
  }
  return (
    <form
      className="grid gap-3 rounded-md border border-border p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const parsed = workoutSetValuesSchema.safeParse(values);
        if (!parsed.success) {
          setError(
            "Enter valid repetitions/time, load, and reps in reserve. Skipped sets need a reason.",
          );
          return;
        }
        setError("");
        if (await onSave(parsed.data)) setDirty(false);
      }}
    >
      <h4 className="font-medium">
        Set {round} {saved && !dirty ? "✓ Saved" : "· Not saved"}
      </h4>
      {previous && (
        <p className="text-xs text-muted">
          Previous: {previous.amount}
          {exercise.unilateral
            ? ` / ${previous.rightAmount ?? previous.amount}`
            : ""}{" "}
          {exercise.unit}
          {previous.weightKg !== null ? ` · ${previous.weightKg} kg` : ""}
        </p>
      )}
      <fieldset disabled={disabled} className="grid gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {exercise.load !== "bodyweight" && (
            <Field
              className="grid gap-1 text-sm"
              label={
                <>
                  kg{" "}
                  {exercise.load === "per-hand"
                    ? "per hand"
                    : "single dumbbell"}
                </>
              }
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                max="1000"
                value={values.weightKg ?? ""}
                placeholder="Bodyweight / none"
                onChange={(e) =>
                  patch({
                    weightKg:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
          )}
          <Field
            className="grid gap-1 text-sm"
            label={
              <>
                {exercise.unit}
                {exercise.unilateral ? " (left)" : ""}
              </>
            }
          >
            <Input
              type="number"
              min={values.skipped ? 0 : 1}
              max="600"
              required
              value={values.amount || ""}
              onChange={(e) => patch({ amount: Number(e.target.value) })}
            />
          </Field>
          {exercise.unilateral && (
            <Field
              className="grid gap-1 text-sm"
              label={<>{exercise.unit} (right)</>}
            >
              <Input
                type="number"
                min="1"
                max="600"
                value={values.rightAmount ?? ""}
                placeholder="Same as left"
                onChange={(e) =>
                  patch({
                    rightAmount:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
          )}
          <Field className="grid gap-1 text-sm" label={<>Reps in reserve</>}>
            <Input
              type="number"
              min="0"
              max="10"
              value={values.rir ?? ""}
              placeholder="Optional"
              onChange={(e) =>
                patch({
                  rir: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.goodForm}
            onChange={(e) => patch({ goodForm: e.target.checked })}
          />
          Good form and no symptoms
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.skipped}
            onChange={(e) =>
              patch({ skipped: e.target.checked, goodForm: false })
            }
          />
          Skip set (symptoms, wrist rehab, or another reason)
        </label>
        <Field
          className="grid gap-1 text-sm"
          label={values.skipped ? "Reason for skipping" : "Set note"}
        >
          <Input
            maxLength={500}
            required={values.skipped}
            value={values.note}
            onChange={(e) => patch({ note: e.target.value })}
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={!dirty}>
          {saved ? "Update set" : "Save set"}
        </Button>
      </fieldset>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
export function WorkoutSession({
  session,
  previousSessions,
  disabled,
  firstWeek,
  onSaveSet,
  onAction,
  onClose,
}: {
  session: Session;
  previousSessions: readonly Session[];
  disabled: boolean;
  firstWeek: boolean;
  onSaveSet: (
    exerciseId: string,
    round: number,
    values: WorkoutSetValues,
  ) => Promise<boolean>;
  onAction: (
    action: "complete" | "abandon" | "note",
    note: string,
  ) => Promise<boolean>;
  onClose: () => void;
}) {
  const snapshot = workoutSnapshotSchema.parse(session.snapshot);
  const [note, setNote] = useState(session.note ?? "");
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const exercises = [...snapshot.workout.exercises].sort(
    (a, b) => a.pair - b.pair,
  );
  const complete = exercises.every((e) =>
    Array.from({ length: session.lowEnergy ? 1 : e.sets }, (_, i) =>
      session.sets.some((s) => s.exerciseId === e.id && s.round === i + 1),
    ).every(Boolean),
  );
  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">
          {snapshot.workout.name} {session.lowEnergy ? "· Low energy" : ""}
        </h2>
        <Button variant="secondary" onClick={onClose}>
          Back
        </Button>
      </div>
      <p className="text-sm text-muted">
        {session.status} ·{" "}
        {session.completedOn ??
          new Date(session.createdAt ?? 0).toLocaleDateString()}{" "}
        · Private log
      </p>
      <p>
        {firstWeek
          ? "Week one: leave 3–4 clean repetitions in reserve."
          : "Leave 2–3 clean repetitions in reserve."}{" "}
        Don't rush technique.
      </p>
      <details>
        <summary className="cursor-pointer font-medium">
          Program and safety guidance
        </summary>
        <p className="whitespace-pre-line py-3 text-sm">{snapshot.guidance}</p>
      </details>
      <details open={session.status === "active"}>
        <summary className="cursor-pointer font-medium">
          Warm-up · 4 minutes
        </summary>
        <p className="whitespace-pre-line py-3 text-sm">{snapshot.warmup}</p>
      </details>
      {session.status === "active" && <RestTimer />}
      <p className="text-sm text-muted">
        Within each pair: exercise 1, switch 15–30s, exercise 2, rest 45–75s;
        repeat the pair before moving on.
      </p>
      {[...new Set(exercises.map((e) => e.pair))].map((pair) => (
        <section
          key={pair}
          className="grid gap-4 rounded-lg border border-border p-4"
        >
          <h3 className="text-lg font-semibold">Pair {pair}</h3>
          {Array.from(
            {
              length: session.lowEnergy
                ? 1
                : Math.max(
                    ...exercises
                      .filter((e) => e.pair === pair)
                      .map((e) => e.sets),
                  ),
            },
            (_, i) => i + 1,
          ).map((round) => (
            <div key={round} className="grid gap-4">
              <h4 className="font-medium">Round {round}</h4>
              {exercises
                .filter(
                  (e) =>
                    e.pair === pair && (session.lowEnergy || e.sets >= round),
                )
                .map((exercise) => {
                  const previous = [...previousSessions]
                    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
                    .find(
                      (s) =>
                        s.id !== session.id &&
                        s.status === "completed" &&
                        (s.completedAt ?? 0) <
                          (session.completedAt ?? session.createdAt ?? 0) &&
                        s.sets.some((set) => set.exerciseId === exercise.id),
                    );
                  const saved = session.sets.find(
                    (s) => s.exerciseId === exercise.id && s.round === round,
                  );
                  const old = previous?.sets.find(
                    (s) => s.exerciseId === exercise.id && s.round === round,
                  );
                  return (
                    <div key={exercise.id} className="grid gap-2">
                      <h5 className="font-semibold">
                        {exercise.name} · {exercise.min}–{exercise.max}{" "}
                        {exercise.unit}
                        {exercise.unilateral ? " each side" : ""}
                      </h5>
                      <p className="text-sm text-muted">{exercise.cues}</p>
                      <SetForm
                        key={`${exercise.id}:${round}`}
                        exercise={exercise}
                        round={round}
                        disabled={disabled || session.status === "abandoned"}
                        saved={
                          saved
                            ? workoutSetValuesSchema.parse(saved.values)
                            : undefined
                        }
                        previous={
                          old
                            ? workoutSetValuesSchema.parse(old.values)
                            : undefined
                        }
                        onSave={(values) =>
                          onSaveSet(exercise.id, round, values)
                        }
                      />
                    </div>
                  );
                })}
            </div>
          ))}
          {exercises
            .filter((e) => e.pair === pair)
            .map((exercise) => (
              <p key={exercise.id} className="text-sm text-muted">
                {exercise.name}:{" "}
                {progressionSuggestion(
                  exercise,
                  session.sets.map((s) => ({
                    ...workoutSetValuesSchema.parse(s.values),
                    exerciseId: s.exerciseId,
                    round: s.round,
                  })),
                  snapshot.incrementKg,
                )}
              </p>
            ))}
        </section>
      ))}
      <details open>
        <summary className="cursor-pointer font-medium">
          Finish · 2–3 minutes
        </summary>
        <p className="whitespace-pre-line py-3 text-sm">{snapshot.finish}</p>
      </details>
      <Field className="grid gap-1" label={<>Session note</>}>
        <Textarea
          disabled={disabled}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={disabled || note === session.note}
          onClick={() => void onAction("note", note)}
        >
          Save note
        </Button>
        {session.status === "active" && (
          <>
            <Button
              disabled={disabled || !complete}
              onClick={async () => {
                if (await onAction("complete", note)) onClose();
              }}
            >
              Complete session
            </Button>
            <Button
              variant="ghost"
              disabled={disabled}
              onClick={() => setConfirmAbandon(true)}
            >
              Abandon session
            </Button>
          </>
        )}
      </div>
      {session.status === "active" && !complete && (
        <p className="text-sm text-muted">
          Save each prescribed set before completing. Low-energy sessions need
          only one set per exercise. If symptoms or wrist rehab replace a set,
          mark it skipped with a reason; never push through to fill the log.
        </p>
      )}
      {confirmAbandon && (
        <div className="grid gap-2 rounded border border-border p-3">
          <p>
            Abandon this session? Saved sets remain in history; the rotation
            will not advance.
          </p>
          <div className="flex gap-2">
            <Button
              disabled={disabled}
              onClick={async () => {
                if (await onAction("abandon", note)) onClose();
              }}
            >
              Confirm abandon
            </Button>
            <Button
              variant="secondary"
              onClick={() => setConfirmAbandon(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
