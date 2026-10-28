import { calendarDate } from "@home-hub/shared/habits";
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
  Button,
  History,
  InlineAlert,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useRef, useState } from "react";
import { useAppHeaderRightComponent } from "../app-header-right-component";
import { useBlockAppUpdate } from "../updates/activity";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { PreviousWorkoutLog } from "./previous-workout-log";
import { WorkoutExercises, WorkoutText } from "./workout-fields";
import { WorkoutHistoryEntry } from "./workout-history-entry";
import { type WorkoutLog, WorkoutLogActions } from "./workout-log";
import {
  collectWorkoutSets,
  openWorkoutLog,
  setInputKey,
  type WorkoutLogForm,
} from "./workout-log-form";

export function WorkoutDetail(props: {
  householdId: string;
  workoutId: string;
}) {
  const zero = useZero();
  return (
    <WorkoutDetailContent
      key={`${zero.userID}:${props.householdId}:${props.workoutId}`}
      {...props}
    />
  );
}
function WorkoutDetailContent({
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
  const [historyCount, setHistoryCount] = useState(20);
  const [windowLogs, logResult] = useQuery(
    queries.workouts.historyWindow({
      householdId,
      workoutId,
      count: historyCount,
    }),
  );
  const lastComplete = useRef<readonly WorkoutLog[]>([]);
  const initiallyLoaded = useRef(false);
  const lastCount = useRef(historyCount);
  if (logResult.type === "complete") {
    lastComplete.current = windowLogs;
    lastCount.current = historyCount;
    initiallyLoaded.current = true;
  }
  const logs =
    logResult.type === "complete" ? windowLogs : lastComplete.current;
  const visibleCount =
    logResult.type === "complete" ? historyCount : lastCount.current;
  const [previousLogs, setPreviousLogs] = useState(
    new Map<string, WorkoutLog>(),
  );
  const [referenceBefore, setReferenceBefore] = useState(0);
  const latestWorkout = useRef(workout);
  latestWorkout.current = workout;
  // This form exists only in component memory. Closing or navigating away drops it.
  const [form, setForm] = useState<WorkoutLogForm>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useBlockAppUpdate(Boolean(form) || busy);
  const [done, setDone] = useState(false);
  const loaded = result.type === "complete" && initiallyLoaded.current;
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
  async function startLog(existing?: WorkoutLog) {
    if (!latestWorkout.current || disabled || busy || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const day = calendarDate(
        Date.now(),
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      );
      // Today's record need not be in the newest-created history window.
      const daily = existing
        ? undefined
        : await zero.run(
            queries.workouts.dailyLog({ householdId, workoutId, day }),
            { type: "complete" },
          );
      const selected = existing ?? daily?.[0];
      const current = latestWorkout.current;
      if (!current) return;
      setPreviousLogs(new Map());
      setReferenceBefore(selected?.completedAt ?? Date.now());
      setForm(
        openWorkoutLog(
          workoutLogSnapshotSchema.parse({
            title: current.title,
            exercises: workoutExercisesFromRows(current.exercises),
          }),
          selected,
        ),
      );
      setDone(false);
      setError("");
    } catch {
      setError("Unable to load workout log.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
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
  if (result.type === "error" && !workout)
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
      {form?.snapshot.exercises.map((exercise) => (
        <PreviousWorkoutLog
          key={`${form.id}:${exercise.id}`}
          householdId={householdId}
          workoutId={workoutId}
          exerciseId={exercise.id}
          excludeId={form.id}
          before={referenceBefore}
          onResult={(id, log, failed) => {
            if (failed) setError("Unable to load previous workout values.");
            setPreviousLogs((previous) => {
              if (previous.get(id) === log) return previous;
              const next = new Map(previous);
              if (log) next.set(id, log);
              else next.delete(id);
              return next;
            });
          }}
        />
      ))}
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
        householdId={householdId}
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
                previous: [
                  ...new Map(
                    [...logs, ...previousLogs.values()].map((log) => [
                      log.id,
                      log,
                    ]),
                  ).values(),
                ].sort(
                  (a, b) =>
                    (b.createdAt ?? 0) - (a.createdAt ?? 0) ||
                    b.id.localeCompare(a.id),
                ),
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
          {logs.slice(0, visibleCount).map((entry) => (
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
        {logResult.type === "error" ? (
          <InlineAlert role="alert" variant="danger">
            Unable to load history.{" "}
            <Button variant="ghost" onClick={() => logResult.retry()}>
              Retry
            </Button>
          </InlineAlert>
        ) : null}
        {logs.length > visibleCount ? (
          <Button
            variant="ghost"
            busy={logResult.type === "unknown"}
            disabled={
              logResult.type !== "complete" || historyCount >= 1_000_000
            }
            onClick={() =>
              setHistoryCount((count) => Math.min(1_000_000, count + 20))
            }
          >
            Load older workouts
          </Button>
        ) : null}
      </section>
    </article>
  );
}
