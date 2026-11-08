import { calendarDate } from "@home-hub/shared/habits";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Button,
  ConfirmationPopover,
  DialogPopup,
  DialogRoot,
  IconButton,
  InlineAlert,
  Trash2,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useAppHeaderRightComponent } from "../app-header-right-component";
import { useBlockAppUpdate } from "../updates/activity";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import {
  projectTrainingSession,
  type TrainingSessionRow,
} from "./training-log-projection";
import { TrainingText, useTrainingText } from "./training-text";
import { WorkoutExercises } from "./workout-fields";
import { WorkoutLogEditor } from "./workout-log-editor";
import { openWorkoutLog } from "./workout-log-form";

export function TrainingSessionPage({
  householdId,
  logId,
}: {
  householdId: string;
  logId?: string;
}) {
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
    const timer = setInterval(update, 60000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  const [pinnedDay, setPinnedDay] = useState<string>();
  const [rows, result] = useQuery(
    queries.training.session({
      householdId,
      ...(logId ? { logId } : { completedOn: pinnedDay ?? day }),
    }),
  );
  const loaded = useRef(false);
  const lastRow = useRef<TrainingSessionRow | undefined>(undefined);
  if (result.type === "complete") {
    loaded.current = true;
  }
  if (rows[0]) {
    lastRow.current = rows[0];
  }
  if (!loaded.current) {
    return result.type === "error" ? (
      <InlineAlert role="alert" variant="danger">
        Unable to load training.
      </InlineAlert>
    ) : (
      <p role="status">Loading training…</p>
    );
  }
  if (logId && !rows[0] && !lastRow.current) {
    return <p>Training session not found.</p>;
  }
  return (
    <>
      {result.type === "error" && (
        <InlineAlert role="alert" variant="danger">
          Unable to load training. Your input is still here.
        </InlineAlert>
      )}
      <TrainingLogger
        key={logId ?? "today"}
        householdId={householdId}
        row={result.type === "complete" ? rows[0] : lastRow.current}
        available={result.type === "complete"}
        onConfirmDay={setPinnedDay}
      />
    </>
  );
}

function TrainingLogger({
  householdId,
  row,
  available,
  onConfirmDay,
}: {
  householdId: string;
  row: TrainingSessionRow | undefined;
  available: boolean;
  onConfirmDay: (day: string) => void;
}) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const navigate = useNavigate();
  const enabledRef = useRef(enabled);
  const article = useRef<HTMLElement>(null);
  const latestRow = useRef(row);
  latestRow.current = row;
  const metadata = useRef({ name: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const action = useRef<() => void>(() => {});
  const leaving = useRef(false);
  const performRef = useRef(
    async (_request: Parameters<typeof zero.mutate>[0]) => false,
  );
  const [editor] = useState(
    () =>
      new WorkoutLogEditor<null>(
        openWorkoutLog(
          { title: "Free training", exercises: [] },
          row ? projectTrainingSession(row) : undefined,
        ),
        {
          householdId,
          workoutId: null,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          enabled: () => enabledRef.current,
          save: (args) =>
            performRef.current(
              mutators.training.saveSet({
                ...args,
                name: metadata.current.name,
                note: metadata.current.note,
              }),
            ),
          remove: (args) =>
            performRef.current(mutators.training.removeSet(args)),
        },
      ),
  );
  const state = useSyncExternalStore(
    editor.subscribe,
    editor.getSnapshot,
    editor.getSnapshot,
  );
  const confirmedDay = state.headerConfirmed ? state.form.completedOn : null;
  useEffect(() => {
    if (confirmedDay) {
      onConfirmDay(confirmedDay);
    }
  }, [confirmedDay, onConfirmDay]);
  const disabled =
    !available || !enabled || busy || (state.headerConfirmed && !row);
  enabledRef.current = !disabled;
  useBlockAppUpdate(true);
  useAppHeaderRightComponent(null);
  useEffect(() => {
    editor.activate();

    return () => editor.dispose();
  }, [editor]);
  useEffect(() => {
    // Only a save acknowledgment or a different canonical daily ID can confirm
    // this editor\'s proposed header; an optimistic echo cannot confirm its text.
    if (
      row &&
      (state.headerConfirmed || row.id !== editor.getSnapshot().form.id)
    ) {
      editor.sync(projectTrainingSession(row));
    }
  }, [editor, row, state.headerConfirmed]);

  async function perform(request: Parameters<typeof zero.mutate>[0]) {
    if (!enabledRef.current) {
      return false;
    }
    try {
      const result = await acknowledgeMutation(zero.mutate(request));
      return result.type === "success";
    } catch {
      return false;
    }
  }
  performRef.current = perform;
  const target = useRef<string | undefined>(undefined);
  const metadataTarget = row && state.headerConfirmed ? row.id : undefined;
  target.current = metadataTarget;
  const name = useTrainingText({
    currentValue: state.headerConfirmed ? (row?.name ?? "") : "",
    enabled: !disabled,
    ready: () => Boolean(target.current),
    save: (value) =>
      target.current
        ? perform(
            mutators.training.update({
              householdId,
              logId: target.current,
              changes: { name: value },
            }),
          )
        : Promise.resolve(false),
  });
  const note = useTrainingText({
    currentValue: state.headerConfirmed ? (row?.note ?? "") : "",
    enabled: !disabled,
    ready: () => Boolean(target.current),
    save: (value) =>
      target.current
        ? perform(
            mutators.training.update({
              householdId,
              logId: target.current,
              changes: { note: value },
            }),
          )
        : Promise.resolve(false),
  });
  metadata.current = { name: name.value.trim(), note: note.value.trim() };
  const text = useRef({ name, note });
  text.current = { name, note };
  useEffect(() => {
    if (metadataTarget) {
      text.current.name.dismissError();
      text.current.note.dismissError();
      text.current.name.retry();
      text.current.note.retry();
    }
  }, [metadataTarget]);
  const [previousRows] = useQuery(
    queries.workouts.previousExercises({
      excludeSessionId: state.form.id,
      householdId,
      exerciseIds: state.form.snapshot.exercises.map(
        (exercise) => exercise.catalogExerciseId ?? exercise.id,
      ),
      beforeAt: state.form.completedAt ?? state.form.startedAt ?? 0,
    }),
  );
  const previous = useMemo(
    () =>
      new Map(
        previousRows.flatMap((exercise) =>
          exercise.performances[0]
            ? [[exercise.id, exercise.performances[0]] as const]
            : [],
        ),
      ),
    [previousRows],
  );
  const dirty = state.hasChanges || name.hasChanges || note.hasChanges || busy;
  const blocker = useBlocker({
    shouldBlockFn: () => {
      if (leaving.current || !dirty) {
        return false;
      }
      void editor.flush();
      return true;
    },
    enableBeforeUnload: () => !leaving.current && dirty,
    withResolver: true,
  });
  const goBack = () => {
    void navigate({
      to: "/households/$householdId/workouts",
      params: { householdId },
    });
  };
  function close() {
    if (dirty) {
      void editor.flush();
      action.current = goBack;
      setConfirmClose(true);
    } else {
      goBack();
    }
  }
  function forgetExercise(exerciseId: string) {
    const container = article.current;
    const rows = editor.getSnapshot().form.snapshot.exercises;
    const index = rows.findIndex((exercise) => exercise.id === exerciseId);
    const neighbor = rows[index + 1] ?? rows[index - 1];
    const oldRow = container?.querySelector(
      `[data-exercise-id="${CSS.escape(exerciseId)}"]`,
    );

    if (!editor.discardExercise(exerciseId)) {
      return;
    }

    requestAnimationFrame(() => {
      if (!container?.isConnected) {
        return;
      }

      const focused = document.activeElement;

      if (focused !== document.body && !oldRow?.contains(focused)) {
        return;
      }

      const next = neighbor
        ? container.querySelector<HTMLInputElement>(
            `[data-exercise-id="${CSS.escape(neighbor.id)}"] input`,
          )
        : container.querySelector<HTMLButtonElement>(
            'button[title="Add exercise"]',
          );

      next?.focus();
    });
  }

  async function removeExercise(exerciseId: string) {
    if (busy || state.saving.size) {
      return;
    }
    const saved = latestRow.current?.exercises.some(
      (row) => row.exerciseId === exerciseId && row.deletedAt === null,
    );
    if (!saved) {
      forgetExercise(exerciseId);
      return;
    }
    setBusy(true);
    setError("");
    // Do not use perform after setting busy: it deliberately disables new writes.
    try {
      const result = await acknowledgeMutation(
        zero.mutate(
          mutators.training.removeExercise({
            householdId,
            logId: state.form.id,
            sessionExerciseId:
              state.form.sessionExerciseIds?.[exerciseId] ?? "",
          }),
        ),
      );
      if (result.type !== "success") {
        throw Error("remove");
      }
      forgetExercise(exerciseId);
    } catch {
      setError("Unable to remove this exercise. Your log is still here.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article ref={article} className="grid min-w-0 gap-2">
      {error && (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      )}
      {state.headerConfirmed && !row && (
        <InlineAlert role="alert" variant="danger">
          This session is no longer available. Unsaved input is still here.
        </InlineAlert>
      )}
      <WorkoutExercises
        householdId={householdId}
        title={
          <TrainingText
            editor={name}
            label="Session name"
            placeholder="Free training"
            disabled={disabled}
            className="h-9! min-w-0 text-2xl! font-semibold"
          />
        }
        current={state.form.snapshot.exercises}
        disabled={disabled}
        onSave={async () => false}
        onStartLogging={async () => {}}
        onCloseLogging={close}
        logging={{
          form: state.form,
          state,
          freeForm: true,
          previous,
          onAddExercise: editor.addExercise,
          onChange: editor.change,
          onFlush: (id, round) => {
            void editor.flush(id, round);
          },
          onAddSet: editor.addSet,
          onRemoveSet: (id, round) => {
            void editor.removeSet(id, round);
          },
          onRemoveExercise: (id) => {
            void removeExercise(id);
          },
        }}
      />
      {!state.form.snapshot.exercises.length && (
        <p className="text-sm text-muted">Add an exercise to begin.</p>
      )}
      <TrainingText
        editor={note}
        label="Session note"
        placeholder="Note…"
        maxLength={1000000}
        disabled={disabled}
        className="text-sm text-muted"
      />
      {row && state.headerConfirmed && (
        <div className="flex justify-end">
          <ConfirmationPopover
            message="Delete this session and all its recorded sets and notes?"
            confirmLabel="Delete session"
            trigger={
              <IconButton
                aria-label="Delete session"
                title="Delete session"
                disabled={disabled || state.saving.size > 0}
              >
                <Trash2 className="size-4" />
              </IconButton>
            }
            onConfirm={async () => {
              setBusy(true);
              setError("");
              try {
                const result = await acknowledgeMutation(
                  zero.mutate(
                    mutators.training.delete({
                      householdId,
                      logId: state.form.id,
                      optimisticTimestamp: Date.now(),
                    }),
                  ),
                );
                if (result.type !== "success") {
                  throw Error("delete");
                }
                leaving.current = true;
                editor.dispose();
                goBack();
              } catch {
                setError("Unable to delete this session.");
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>
      )}
      <DialogRoot
        open={confirmClose || blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmClose(false);
            blocker.reset?.();
          }
        }}
      >
        <DialogPopup
          title="Unsaved training details"
          actions={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setConfirmClose(false);
                  blocker.reset?.();
                }}
              >
                Keep logging
              </Button>
              <Button
                onClick={() => {
                  setConfirmClose(false);
                  leaving.current = true;
                  editor.dispose();
                  if (blocker.status === "blocked") {
                    blocker.proceed?.();
                  } else {
                    action.current();
                  }
                }}
              >
                Discard unsaved input
              </Button>
            </>
          }
        >
          Saved sets stay recorded. Discard unsaved exercises, names, notes or
          set edits and leave logging? Requests already being saved will
          continue.
        </DialogPopup>
      </DialogRoot>
    </article>
  );
}
