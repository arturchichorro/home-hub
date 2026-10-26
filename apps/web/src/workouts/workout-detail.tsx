import {
  planExerciseEdits,
  workoutExercisesFromRows,
  workoutLogSnapshotSchema,
} from "@home-hub/shared/workouts";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import {
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionRoot,
  AccordionTrigger,
  History,
  InlineAlert,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useRef, useState } from "react";
import { useAppHeaderRightComponent } from "../app-header-right-component";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { WorkoutExercises, WorkoutText } from "./workout-fields";
import { WorkoutHistoryEntry } from "./workout-history-entry";
import { type WorkoutLog, WorkoutLogActions } from "./workout-log";
import {
  collectWorkoutSets,
  findDailyWorkoutLog,
  openWorkoutLog,
  setInputKey,
  type WorkoutLogForm,
} from "./workout-log-form";

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
          exercises: workoutExercisesFromRows(current.exercises),
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
          workoutExercisesFromRows(workout.exercises)
        }
        disabled={disabled || busy}
        onSave={async (exercises, previous) => {
          const edits = planExerciseEdits(previous, exercises);
          if (
            !edits.creates.length &&
            !edits.updates.length &&
            !edits.deletes.length
          )
            return true;
          return save(
            mutators.workouts.editExercises({ ...scope(), ...edits }),
          );
        }}
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
        <WorkoutLogActions
          disabled={disabled || busy}
          onComplete={() => void finishLog()}
          onCancel={closeLog}
        />
      )}
      <section className="grid gap-1" aria-label="Workout notes">
        <AccordionRoot>
          <AccordionItem value="notes">
            <AccordionHeader render={(props) => <h2 {...props} />}>
              <AccordionTrigger>Notes</AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel>
              <WorkoutText
                label="Notes"
                value={workout.notes ?? ""}
                multiline
                disabled={disabled}
                readOnly={!!form}
                onSave={(notes) =>
                  save(
                    mutators.workouts.update({
                      ...scope(),
                      changes: { notes },
                    }),
                  )
                }
              />
            </AccordionPanel>
          </AccordionItem>
        </AccordionRoot>
      </section>
      <section className="min-w-0">
        <h2 className="flex items-center gap-2 py-3 font-semibold">
          <History aria-hidden="true" className="size-4" />
          History
        </h2>
        <ul className="divide-y divide-border">
          {logs.map((entry) => (
            <WorkoutHistoryEntry
              key={entry.id}
              entry={entry}
              householdId={householdId}
              workoutId={workoutId}
              selected={form?.id === entry.id}
              disabled={disabled || busy}
              onSelect={() =>
                form?.id === entry.id ? closeLog() : startLog(entry)
              }
            />
          ))}
        </ul>
      </section>
    </article>
  );
}
