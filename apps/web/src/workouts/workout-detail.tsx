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
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useAppHeaderRightComponent } from "../app-header-right-component";
import { blockAppUpdate, useBlockAppUpdate } from "../updates/activity";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { WorkoutExercises, WorkoutText } from "./workout-fields";
import { WorkoutHistoryEntry } from "./workout-history-entry";
import { type WorkoutLog, WorkoutLogActions } from "./workout-log";
import {
  type WorkoutEditorState,
  WorkoutLogEditor,
} from "./workout-log-editor";
import { findDailyWorkoutLog, openWorkoutLog } from "./workout-log-form";
import {
  type ExercisePerformance,
  projectWorkoutLog,
} from "./workout-log-projection";

const emptySubscribe = () => () => {};
const emptySnapshot = () => undefined;
export function WorkoutDetail(props: {
  householdId: string;
  workoutId: string;
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
}: {
  householdId: string;
  workoutId: string;
}) {
  const zero = useZero(),
    enabled = useZeroMutationEnabled();
  const [workout, result] = useQuery(
    queries.workouts.detail({ householdId, workoutId }),
  );
  const [logRows, logResult] = useQuery(
    queries.workouts.logsV2({ householdId, workoutId }),
  );
  const logs = useMemo(() => logRows.map(projectWorkoutLog), [logRows]);
  const [editor, setEditor] = useState<WorkoutLogEditor>();
  const state = useSyncExternalStore<WorkoutEditorState | undefined>(
    editor?.subscribe ?? emptySubscribe,
    editor?.getSnapshot ?? emptySnapshot,
    emptySnapshot,
  );
  const form = state?.form;
  const loaded = result.type === "complete" && logResult.type === "complete",
    disabled = !enabled || !loaded;
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
    if (!editor) return;
    const current = editor.getSnapshot().form;
    const log = logs.find(
      (entry) =>
        entry.id === current.id ||
        (current.completedOn && entry.completedOn === current.completedOn),
    );
    if (log) editor.sync(log);
  }, [editor, logs]);
  const blocker = useBlocker({
    shouldBlockFn: () => {
      if (!editor?.getSnapshot().hasChanges) return false;
      void editor.flush();
      return true;
    },
    enableBeforeUnload: () => Boolean(editor?.getSnapshot().hasChanges),
    withResolver: true,
  });
  const [previousRows] = useQuery(
    form
      ? queries.workouts.previousExercises({
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
      if (occurrence) map.set(row.id, occurrence);
    }
    return map;
  }, [previousRows]);
  async function perform(
    request: Parameters<typeof zero.mutate>[0],
    report = false,
  ) {
    if (!enabledRef.current) return false;
    const release = blockAppUpdate();
    if (report) setError("");
    try {
      const mutation = zero.mutate(request),
        client = await mutation.client;
      const outcome = client.type === "error" ? client : await mutation.server;
      if (outcome.type === "error") throw Error("save");
      return true;
    } catch {
      if (report) setError("Unable to save workout.");
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
    } else next();
  }
  function startLog(existing?: WorkoutLog) {
    const current = latestWorkout.current;
    if (!current || disabled) return;
    requestAction(() => {
      setEditor(
        new WorkoutLogEditor(
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
          {
            householdId,
            workoutId,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            enabled: () => enabledRef.current,
            save: (args) => perform(mutators.workouts.saveSet(args)),
            remove: (args) => perform(mutators.workouts.removeSet(args)),
          },
        ),
      );
      setError("");
    });
  }
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
    } else action.current();
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
      <WorkoutExercises
        householdId={householdId}
        title={
          <WorkoutText
            label="Workout name"
            value={form?.snapshot.title ?? workout.title}
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
          workoutExercisesFromRows(workout.exercises)
        }
        disabled={disabled}
        onSave={async (exercises, previous) => {
          const edits = planExerciseEdits(previous, exercises);
          if (
            !edits.creates.length &&
            !edits.updates.length &&
            !edits.deletes.length
          )
            return true;
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
                onAddSet: editor.addSet,
                onRemoveSet: (id, round) => {
                  void editor.removeSet(id, round);
                },
              }
            : undefined
        }
      />
      {form && (
        <div className="flex justify-end" data-log-actions>
          <WorkoutLogActions onClose={closeLog} />
        </div>
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
              disabled={
                disabled || (entry.id === form?.id && !state?.headerConfirmed)
              }
              onSelect={() =>
                form?.id === entry.id ? closeLog() : startLog(entry)
              }
            />
          ))}
        </ul>
      </section>
      <DialogRoot
        open={confirmClose || blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) cancelDiscard();
        }}
      >
        <DialogPopup
          title="Unsaved set details"
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
            Saved sets stay recorded. Discard incomplete or failed edits and
            leave logging? Sets already being saved will continue saving.
          </p>
        </DialogPopup>
      </DialogRoot>
    </article>
  );
}
