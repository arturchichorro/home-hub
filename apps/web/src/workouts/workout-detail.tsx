import { calendarDate } from "@home-hub/shared/habits";
import { trainingHistoryPageSize as workoutHistoryPageSize } from "@home-hub/shared/training";
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
  DialogPopup,
  DialogRoot,
  History,
  InlineAlert,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useBlocker } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useAppHeaderRightComponent } from "../app-header-right-component";
import { blockAppUpdate, useBlockAppUpdate } from "../updates/activity";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import {
  type ExercisePerformance,
  projectTrainingSession,
} from "./training-log-projection";
import { WorkoutExercises, WorkoutText } from "./workout-fields";
import { WorkoutHistoryEntry } from "./workout-history-entry";
import { type WorkoutLog, WorkoutLogActions } from "./workout-log";
import {
  type WorkoutEditorState,
  WorkoutLogEditor,
} from "./workout-log-editor";
import { findDailyWorkoutLog, openWorkoutLog } from "./workout-log-form";

const emptySubscribe = () => () => {};

const emptySnapshot = () => undefined;

export function WorkoutDetail(props: {
  householdId: string;
  workoutId: string;
  initialLogId?: string | undefined;
}) {
  return (
    <WorkoutDetailPage
      key={`${props.householdId}:${props.workoutId}`}
      {...props}
    />
  );
}

function WorkoutDetailPage({
  householdId,
  workoutId,
  initialLogId,
}: {
  householdId: string;
  workoutId: string;
  initialLogId?: string | undefined;
}) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const [workout, result] = useQuery(
    queries.workouts.detail({ householdId, workoutId }),
  );
  const [dirtyNotes, setDirtyNotes] = useState(new Set<string>());
  const noteDraftChanged = useCallback(
    (id: string, dirty: boolean) =>
      setDirtyNotes((previous) => {
        if (previous.has(id) === dirty) {
          return previous;
        }

        const next = new Set(previous);

        if (dirty) {
          next.add(id);
        } else {
          next.delete(id);
        }

        return next;
      }),
    [],
  );
  const [cursors, setCursors] = useState<
    { completedOn: string; completedAt: number; id: string }[]
  >([]);
  const [logRows, logResult] = useQuery(
    queries.training.history({
      includeExercises: true,
      householdId,
      workoutId,
      cursor: cursors.at(-1),
    }),
  );
  const [editor, setEditor] = useState<WorkoutLogEditor>();
  const state = useSyncExternalStore<WorkoutEditorState | undefined>(
    editor?.subscribe ?? emptySubscribe,
    editor?.getSnapshot ?? emptySnapshot,
    emptySnapshot,
  );
  const form = state?.form;
  const activeLogId = form?.id;
  const activeLogDay = form?.completedOn;
  const requestedLogId = activeLogId ?? initialLogId;
  const startedAt = form?.startedAt;
  const [day, setDay] = useState(() =>
    calendarDate(Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone),
  );

  useEffect(() => {
    const update = () =>
      setDay(
        calendarDate(
          Date.now(),
          Intl.DateTimeFormat().resolvedOptions().timeZone,
        ),
      );
    const timer = setInterval(update, 60_000);
    window.addEventListener("focus", update);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);

  const [dailyRows, dailyResult] = useQuery(
    queries.training.session({ householdId, workoutId, completedOn: day }),
  );
  const [selectedRows] = useQuery(
    requestedLogId
      ? queries.training.session({
          householdId,
          workoutId,
          logId: requestedLogId,
        })
      : undefined,
  );
  const logs = useMemo(
    () =>
      [
        ...new Map(
          [...logRows, ...(dailyRows ?? []), ...(selectedRows ?? [])].map(
            (row) => [row.id, row],
          ),
        ).values(),
      ].map(projectTrainingSession),
    [logRows, dailyRows, selectedRows],
  );
  const visibleLogs = logRows
    .slice(0, workoutHistoryPageSize)
    .map(projectTrainingSession);
  const selected = logs.find((log) => log.id === activeLogId);

  if (selected && !visibleLogs.some((log) => log.id === selected.id)) {
    visibleLogs.unshift(selected);
  }

  const loaded = result.type === "complete" && dailyResult.type === "complete";
  const disabled = !enabled || !loaded;
  const enabledRef = useRef(false);
  enabledRef.current = !disabled;

  const latestWorkout = useRef(workout);
  latestWorkout.current = workout;

  const latestLogs = useRef(logs);
  latestLogs.current = logs;

  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const action = useRef<() => void>(() => {});
  useBlockAppUpdate(Boolean(editor));

  useEffect(() => () => editor?.dispose(), [editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const log =
      logs.find((entry) => entry.id === activeLogId) ??
      (activeLogDay
        ? logs.find((entry) => entry.completedOn === activeLogDay)
        : findDailyWorkoutLog(
            logs,
            startedAt ?? Date.now(),
            Intl.DateTimeFormat().resolvedOptions().timeZone,
          ));

    if (log) {
      editor.sync(log);
    }
  }, [editor, logs, activeLogId, activeLogDay, startedAt]);

  const blocker = useBlocker({
    shouldBlockFn: () => {
      if (!editor?.getSnapshot().hasChanges) {
        return false;
      }

      void editor.flush();

      return true;
    },

    enableBeforeUnload: () => Boolean(editor?.getSnapshot().hasChanges),

    withResolver: true,
  });
  const [previousRows] = useQuery(
    form
      ? queries.workouts.previousExercises({
          excludeSessionId: state.form.id,
          householdId,
          exerciseIds: [
            ...new Set(
              form.snapshot.exercises.flatMap((e) =>
                e.catalogExerciseId ? [e.catalogExerciseId] : [],
              ),
            ),
          ],
          beforeAt: form.completedAt ?? form.startedAt ?? 0,
        })
      : undefined,
  );
  const previous = useMemo(() => {
    const map = new Map<string, ExercisePerformance>();

    for (const row of previousRows ?? []) {
      const occurrence = row.performances[0];

      if (occurrence) {
        map.set(row.id, occurrence);
      }
    }

    return map;
  }, [previousRows]);

  async function perform(
    request: Parameters<typeof zero.mutate>[0],
    report = false,
  ) {
    if (!enabledRef.current) {
      return false;
    }

    const release = blockAppUpdate();

    if (report) {
      setError("");
    }

    try {
      const mutation = zero.mutate(request);
      const outcome = await acknowledgeMutation(mutation);

      if (outcome.type === "error") {
        throw Error("save");
      }

      return true;
    } catch {
      if (report) {
        setError("Unable to save workout.");
      }

      return false;
    } finally {
      release();
    }
  }

  function requestAction(next: () => void) {
    if (editor?.getSnapshot().hasChanges) {
      void editor.flush();
      action.current = next;
      setConfirmClose(true);
    } else {
      next();
    }
  }

  function startLog(existing?: WorkoutLog) {
    const current = latestWorkout.current;

    if ((!current && !existing) || disabled) {
      return;
    }
    const snapshot = existing
      ? workoutLogSnapshotSchema.parse(existing.snapshot)
      : current
        ? workoutLogSnapshotSchema.parse({
            title: current.title,
            exercises: workoutExercisesFromRows(current.exercises),
          })
        : undefined;
    if (!snapshot) {
      return;
    }

    requestAction(() => {
      setEditor(
        new WorkoutLogEditor(
          openWorkoutLog(
            snapshot,
            existing ??
              findDailyWorkoutLog(
                latestLogs.current,
                Date.now(),
                Intl.DateTimeFormat().resolvedOptions().timeZone,
              ),
          ),
          {
            householdId,
            workoutId,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,

            enabled: () => enabledRef.current,

            save: (args) => perform(mutators.training.saveSet(args)),

            remove: (args) => perform(mutators.training.removeSet(args)),
          },
        ),
      );
      setError("");
    });
  }

  const openedFromHistory = useRef<string | undefined>(undefined);
  const startFromHistory = useRef(startLog);
  startFromHistory.current = startLog;
  useEffect(() => {
    if (
      !initialLogId ||
      openedFromHistory.current === initialLogId ||
      disabled
    ) {
      return;
    }
    const entry = logs.find((log) => log.id === initialLogId);
    if (entry) {
      openedFromHistory.current = initialLogId;
      startFromHistory.current(entry);
    }
  }, [initialLogId, logs, disabled]);

  function closeLog() {
    requestAction(() => {
      setEditor(undefined);
      setError("");
    });
  }

  function cancelDiscard() {
    setConfirmClose(false);
    blocker.reset?.();
  }

  function discard() {
    setConfirmClose(false);

    if (blocker.status === "blocked") {
      editor?.dispose();
      blocker.proceed?.();
    } else {
      action.current();
    }
  }

  useAppHeaderRightComponent(null);

  if (result.type === "error" || dailyResult.type === "error") {
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to load workout.
      </InlineAlert>
    );
  }

  const historicalSource = initialLogId
    ? logs.find((log) => log.id === initialLogId)
    : undefined;
  if (!workout && !form && !historicalSource) {
    return result.type === "complete" ? (
      <p className="text-muted">Workout not found.</p>
    ) : null;
  }

  const scope = () => ({
    householdId,
    workoutId,
    optimisticTimestamp: Date.now(),
  });

  return (
    <article className="grid min-w-0 gap-2">
      {error && (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      )}
      {workout || form ? (
        <WorkoutExercises
          householdId={householdId}
          title={
            <WorkoutText
              label="Workout name"
              value={form?.snapshot.title ?? workout?.title ?? "Workout"}
              disabled={disabled}
              readOnly={!!form}
              onSave={(title) =>
                perform(
                  mutators.workouts.update({ ...scope(), changes: { title } }),
                  true,
                )
              }
            />
          }
          current={
            form?.snapshot.exercises ??
            workoutExercisesFromRows(workout?.exercises ?? [])
          }
          disabled={disabled}
          onSave={async (exercises, previous) => {
            const edits = planExerciseEdits(previous, exercises);

            if (
              !edits.creates.length &&
              !edits.updates.length &&
              !edits.deletes.length
            ) {
              return true;
            }

            return perform(
              mutators.workouts.editExercises({ ...scope(), ...edits }),
              true,
            );
          }}
          onStartLogging={async () => startLog()}
          onCloseLogging={closeLog}
          logging={
            form && state && editor
              ? {
                  form,
                  state,
                  previous,
                  onChange: editor.change,

                  onFlush: (id, round) => {
                    void editor.flush(id, round);
                  },

                  onAddExercise: editor.addExercise,
                  excludedExerciseIds:
                    workout?.exercises.map((row) => row.exerciseId) ?? [],
                  onAddSet: editor.addSet,

                  onRemoveSet: (id, round) => {
                    void editor.removeSet(id, round);
                  },
                }
              : undefined
          }
        />
      ) : (
        <p className="text-sm text-muted">Workout template removed.</p>
      )}
      {form && (
        <div className="flex justify-end" data-log-actions>
          <WorkoutLogActions onClose={closeLog} />
        </div>
      )}
      {workout && (
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
                    perform(
                      mutators.workouts.update({
                        ...scope(),
                        changes: { notes },
                      }),
                      true,
                    )
                  }
                />
              </AccordionPanel>
            </AccordionItem>
          </AccordionRoot>
        </section>
      )}
      <section className="min-w-0">
        <h2 className="flex items-center gap-2 py-3 font-semibold">
          <History aria-hidden="true" className="size-4" />
          History
        </h2>
        <ul className="divide-y divide-border">
          {visibleLogs.map((entry) => (
            <WorkoutHistoryEntry
              key={entry.id}
              entry={entry}
              onDraftChange={noteDraftChanged}
              householdId={householdId}
              selected={form?.id === entry.id}
              disabled={
                disabled ||
                logResult.type !== "complete" ||
                (entry.id === form?.id && !state?.headerConfirmed)
              }
              onSelect={() =>
                form?.id === entry.id ? closeLog() : startLog(entry)
              }
            />
          ))}
        </ul>
        {logResult.type === "error" && (
          <InlineAlert role="alert" variant="danger">
            Unable to load history.{" "}
            <Button
              variant="ghost"
              disabled={dirtyNotes.size > 0}
              onClick={() => setCursors([])}
            >
              Return to recent history
            </Button>
          </InlineAlert>
        )}
        {logResult.type !== "complete" && logResult.type !== "error" && (
          <p role="status" className="text-sm text-muted">
            Loading history…
          </p>
        )}
        <div className="flex gap-2">
          {cursors.length > 0 && (
            <Button
              variant="ghost"
              disabled={logResult.type !== "complete" || dirtyNotes.size > 0}
              onClick={() => setCursors((previous) => previous.slice(0, -1))}
            >
              Newer history
            </Button>
          )}
          {logRows.length > workoutHistoryPageSize && (
            <Button
              variant="ghost"
              disabled={logResult.type !== "complete" || dirtyNotes.size > 0}
              onClick={() => {
                const last = logRows[workoutHistoryPageSize - 1];

                if (last) {
                  setCursors((previous) => [
                    ...previous,
                    {
                      completedOn: last.completedOn,
                      completedAt: last.completedAt,
                      id: last.id,
                    },
                  ]);
                }
              }}
            >
              Load older history
            </Button>
          )}
        </div>
      </section>
      <DialogRoot
        open={confirmClose || blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) {
            cancelDiscard();
          }
        }}
      >
        <DialogPopup
          title="Unsaved log changes"
          actions={
            <>
              <Button variant="ghost" onClick={cancelDiscard}>
                Keep logging
              </Button>
              <Button onClick={discard}>Discard unsaved input</Button>
            </>
          }
        >
          <p>
            Saved sets stay recorded. Discard unsaved exercise additions and
            incomplete or failed edits and leave logging? Sets already being
            saved will continue saving.
          </p>
        </DialogPopup>
      </DialogRoot>
    </article>
  );
}
