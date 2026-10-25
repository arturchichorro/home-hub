import {
  workoutExercisesSchema,
  workoutLogSnapshotSchema,
} from "@home-hub/shared/workouts";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import { Check, History, InlineAlert, Textarea } from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useRef, useState } from "react";
import { useAppHeaderRightComponent } from "../app-header-right-component";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { WorkoutExercises, WorkoutText } from "./workout-fields";
import { type WorkoutLog, WorkoutLogActions } from "./workout-log";
import {
  collectWorkoutSets,
  findDailyWorkoutLog,
  openWorkoutLog,
  setInputKey,
  type WorkoutLogForm,
} from "./workout-log-form";
import { summarizeWorkoutLog } from "./workout-log-summary";

export function WorkoutDetail({
  householdId,
  workoutId,
}: {
  householdId: string;
  workoutId: string;
}) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const [workout, result] = useQuery(
    queries.workouts.detail({ householdId, workoutId }),
  );
  const [logs, logResult] = useQuery(
    queries.workouts.logs({ householdId, workoutId }),
  );
  const latestWorkout = useRef(workout);
  latestWorkout.current = workout;
  const latestLogs = useRef(logs);
  latestLogs.current = logs;
  // This form exists only in component memory. Closing or navigating away drops it.
  const [form, setForm] = useState<WorkoutLogForm>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [done, setDone] = useState(false);
  const loaded = result.type === "complete" && logResult.type === "complete";
  const disabled = !enabled || !loaded;
  const scope = () => ({
    householdId,
    workoutId,
    optimisticTimestamp: Date.now(),
  });
  async function save(request: Parameters<typeof zero.mutate>[0]) {
    if (!enabled || !loaded) return false;
    setError("");
    try {
      const mutation = zero.mutate(request);
      const client = await mutation.client;
      const outcome = client.type === "error" ? client : await mutation.server;
      if (outcome.type === "error") throw new Error("save");
      return true;
    } catch {
      setError("Unable to save workout.");
      return false;
    }
  }
  function startLog(existing?: WorkoutLog) {
    const current = latestWorkout.current;
    if (!current || disabled || busy) return;
    setForm(
      openWorkoutLog(
        workoutLogSnapshotSchema.parse({
          title: current.title,
          exercises: current.exercises,
        }),
        existing ??
          findDailyWorkoutLog(
            latestLogs.current,
            Date.now(),
            Intl.DateTimeFormat().resolvedOptions().timeZone,
          ),
      ),
    );
    setDone(false);
    setError("");
  }
  function closeLog() {
    if (!pending.current) {
      setForm(undefined);
      setError("");
    }
  }
  async function finishLog() {
    if (!form || disabled || pending.current) return;
    const collected = collectWorkoutSets(form.snapshot.exercises, form.inputs);
    if (!collected.success) {
      setError(collected.error);
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      if (
        await save(
          mutators.workouts.saveLog({
            ...scope(),
            logId: form.id,
            snapshot: form.snapshot,
            note: form.note.trim(),
            sets: collected.sets,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        )
      ) {
        setForm(undefined);
        setDone(true);
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  useAppHeaderRightComponent(null);
  if (result.type === "error" || logResult.type === "error")
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to load workout.
      </InlineAlert>
    );
  if (!workout)
    return result.type === "complete" ? (
      <p className="text-muted">Workout not found.</p>
    ) : null;
  return (
    <article className="grid min-w-0 gap-2">
      {error && (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      )}
      {done && (
        <p role="status" className="text-sm text-muted">
          Done
        </p>
      )}
      <WorkoutExercises
        title={
          <WorkoutText
            label="Workout name"
            value={form?.snapshot.title ?? workout.title}
            disabled={disabled}
            readOnly={!!form}
            onSave={(title) =>
              save(mutators.workouts.update({ ...scope(), changes: { title } }))
            }
          />
        }
        current={
          form?.snapshot.exercises ??
          workoutExercisesSchema.parse(workout.exercises)
        }
        disabled={disabled || busy}
        onSave={(exercises) =>
          save(mutators.workouts.update({ ...scope(), changes: { exercises } }))
        }
        onStartLogging={async () => startLog()}
        onCloseLogging={closeLog}
        onCompleteLogging={() => void finishLog()}
        logging={
          form
            ? {
                form,
                previous: logs,
                onChange: (exerciseId, round, patch) =>
                  setForm((current) => {
                    if (!current) return current;
                    const key = setInputKey(exerciseId, round);
                    return {
                      ...current,
                      inputs: {
                        ...current.inputs,
                        [key]: {
                          weightKg: "",
                          amount: "",
                          rightAmount: "",
                          ...current.inputs[key],
                          ...patch,
                        },
                      },
                    };
                  }),
              }
            : undefined
        }
      />
      {form && (
        <section className="grid gap-1" aria-label="Workout log note">
          <h2 className="pt-2 text-sm font-medium">Log note</h2>
          <Textarea
            appearance="seamless"
            aria-label="Log note"
            placeholder="Add a log note…"
            rows={1}
            maxLength={1000000}
            disabled={disabled || busy}
            value={form.note}
            onChange={(event) => {
              const note = event.target.value;
              setForm((current) => (current ? { ...current, note } : current));
            }}
          />
          <WorkoutLogActions
            disabled={disabled || busy}
            onComplete={() => void finishLog()}
            onCancel={closeLog}
          />
        </section>
      )}
      <section className="grid gap-1" aria-label="Workout notes">
        <h2 className="pt-2 text-sm font-medium">Notes</h2>
        <WorkoutText
          label="Notes"
          value={workout.notes ?? ""}
          multiline
          disabled={disabled}
          readOnly={!!form}
          onSave={(notes) =>
            save(mutators.workouts.update({ ...scope(), changes: { notes } }))
          }
        />
      </section>
      <section className="min-w-0">
        <h2 className="flex items-center gap-2 py-3 font-semibold">
          <History aria-hidden="true" className="size-4" />
          History
        </h2>
        <ul className="divide-y divide-border">
          {logs.map((entry) => {
            const summary = summarizeWorkoutLog(entry);
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  aria-pressed={form?.id === entry.id}
                  disabled={disabled || busy}
                  className="grid min-h-11 w-full min-w-0 gap-1 py-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  onClick={() =>
                    form?.id === entry.id ? setForm(undefined) : startLog(entry)
                  }
                >
                  <span className="flex items-center gap-3">
                    <Check
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted"
                    />
                    <span>{entry.completedOn}</span>
                  </span>
                  <span className="grid min-w-0 gap-1 pl-7 text-xs font-normal text-muted">
                    {summary.length ? (
                      summary.map((exercise) => (
                        <span key={exercise.id} className="break-words">
                          <span className="font-medium">{exercise.name}</span> —{" "}
                          {exercise.details}
                        </span>
                      ))
                    ) : (
                      <span>No sets logged.</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </article>
  );
}
