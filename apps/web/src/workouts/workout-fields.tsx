import type { WorkoutExercise } from "@home-hub/shared/workouts";
import {
  Button,
  ErrorPopover,
  InlineAlert,
  Input,
  Play,
  Textarea,
} from "@home-hub/ui-web";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  TextDraftActions,
  TextDraftGuard,
} from "../editing/text-draft-actions";
import { useDebouncedTextEditor } from "../editing/use-debounced-text-editor";
import { WorkoutExerciseRow } from "./workout-exercise-row";

export function WorkoutText({
  label,
  value,
  disabled,
  multiline = false,
  onSave,
  readOnly = false,
  placeholder,
  onDraftChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  multiline?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  onDraftChange?: (value: string) => void;
  onSave: (value: string) => Promise<boolean>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const editor = useDebouncedTextEditor({
    preserveOnFailure: true,
    currentValue: value,
    mutationEnabled: !disabled && !readOnly,

    normalize: (v) => v.trim(),

    required: !multiline,
    failureError: "Unable to save.",
    save: onSave,
  });

  useEffect(() => {
    onDraftChange?.(editor.value);
  }, [editor.value, onDraftChange]);

  const props = {
    appearance: "seamless" as const,
    "aria-label": label,
    "aria-busy": editor.isSaving || undefined,
    "aria-invalid": editor.error ? (true as const) : undefined,
    "aria-errormessage": editor.error ? editor.errorId : undefined,
    disabled,
    readOnly,
    value: editor.value,
    onBlur: readOnly ? undefined : editor.handleBlur,
  };

  return (
    <>
      {multiline ? (
        <Textarea
          {...props}
          ref={textarea}
          placeholder={placeholder ?? "Notes…"}
          rows={1}
          maxLength={1000000}
          onChange={(e) => editor.changeValue(e.target.value)}
          onKeyDown={(e) => {
            if (!readOnly) {
              editor.handleKeyDown(e, false);
            }
          }}
        />
      ) : (
        <Input
          {...props}
          ref={input}
          maxLength={150}
          className="h-8! text-sm font-medium"
          onValueChange={editor.changeValue}
          onKeyDown={(e) => {
            if (!readOnly) {
              editor.handleKeyDown(e, true);
            }
          }}
        />
      )}
      {editor.hasChanges && <TextDraftGuard editor={editor} />}
      <ErrorPopover
        anchor={multiline ? textarea : input}
        id={editor.errorId}
        open={editor.error !== undefined}
        onDismiss={editor.dismissError}
      >
        {editor.error}
        <TextDraftActions editor={editor} />
      </ErrorPopover>
    </>
  );
}

import { AddExercisePicker } from "./add-exercise-picker";
import { useWorkoutExercisesEditor } from "./use-workout-exercises-editor";
import { WorkoutLogActions, type WorkoutLogging } from "./workout-log";

export function WorkoutExercises({
  householdId,
  title,
  current,
  disabled,
  onSave,
  logging,
  onStartLogging,
  onCloseLogging,
}: {
  householdId: string;
  title?: ReactNode;
  current: readonly WorkoutExercise[];
  disabled: boolean;
  onSave: (
    exercises: WorkoutExercise[],
    previous: readonly WorkoutExercise[],
  ) => Promise<boolean>;
  logging?: WorkoutLogging | undefined;
  onStartLogging: () => Promise<void>;
  onCloseLogging: () => void;
}) {
  const [starting, setStarting] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [mediaBusy, setMediaBusy] = useState<ReadonlySet<string>>(new Set());
  const root = useRef<HTMLElement>(null);
  const mediaWorkChanged = useCallback(
    (id: string, busy: boolean) =>
      setMediaBusy((previous) => {
        if (previous.has(id) === busy) {
          return previous;
        }
        const next = new Set(previous);
        if (busy) {
          next.add(id);
        } else {
          next.delete(id);
        }
        return next;
      }),
    [],
  );
  const editor = useWorkoutExercisesEditor({
    current,
    enabled: !disabled && !logging,
    save: onSave,
  });
  const exercises = editor.exercises;
  useEffect(() => {
    if (logging) {
      setEditingId(undefined);
    }
  }, [logging]);
  const definitionDraft = {
    hasChanges: editor.hasChanges,
    isSaving: editor.isSaving,
    error: editor.error || undefined,
    retry: () => {
      void editor.flush();
    },
    discard: editor.revert,
  };

  async function beginEditing(id: string) {
    if (mediaBusy.size > 0) {
      return;
    }
    if (!(await editor.flush())) {
      root.current
        ?.querySelector<HTMLInputElement>(
          `[data-exercise-id="${editingId}"] input`,
        )
        ?.focus();
      return;
    }
    setEditingId(id);
  }

  function change(
    id: string,
    patch: Partial<WorkoutExercise>,
    immediate = false,
  ) {
    editor.change((rows) => {
      const catalogId = rows.find((row) => row.id === id)?.catalogExerciseId;
      const shared = {
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.unit === undefined ? {} : { unit: patch.unit }),
        ...(patch.load === undefined ? {} : { load: patch.load }),
        ...(patch.unilateral === undefined
          ? {}
          : { unilateral: patch.unilateral }),
      };

      return rows.map((row) =>
        row.id === id
          ? { ...row, ...patch }
          : catalogId && row.catalogExerciseId === catalogId
            ? { ...row, ...shared }
            : row,
      );
    }, immediate);
  }

  return (
    <section
      ref={root}
      aria-label="Workout exercises"
      className="grid min-w-0 gap-0"
      aria-busy={editor.isSaving || starting || undefined}
      onBlurCapture={() => {
        if (!logging) {
          void editor.flush();
        }
      }}
      onKeyDown={(event) => {
        if (
          !logging &&
          event.key === "Enter" &&
          event.target instanceof HTMLInputElement
        ) {
          event.preventDefault();

          if (!disabled && !starting) {
            void editor.flush();
          }
        }
      }}
    >
      {editor.hasChanges && <TextDraftGuard editor={definitionDraft} />}
      <div
        className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 py-2"
        data-workout-heading
      >
        <div className="flex min-w-40 flex-1 items-center">{title}</div>
        <div className="flex shrink-0 items-center gap-2">
          {logging ? (
            <>
              <AddExercisePicker
                householdId={householdId}
                disabled={disabled || current.length >= 40}
                allowCreate={false}
                iconOnly
                excludedExerciseIds={[
                  ...(logging.excludedExerciseIds ?? []),
                  ...current.map(
                    (exercise) => exercise.catalogExerciseId ?? exercise.id,
                  ),
                ]}
                onSelect={logging.onAddExercise}
              />
              {logging.form.completedOn && (
                <span className="text-xs text-muted">
                  {logging.form.completedOn}
                </span>
              )}
              <WorkoutLogActions onClose={onCloseLogging} />
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                className="h-7! px-1! text-xs! font-normal text-muted sm:text-sm!"
                disabled={disabled || starting || mediaBusy.size > 0}
                onClick={async () => {
                  setStarting(true);

                  try {
                    if (await editor.flush()) {
                      await onStartLogging();
                    }
                  } finally {
                    setStarting(false);
                  }
                }}
              >
                <Play aria-hidden="true" className="size-4" />
                Log workout
              </Button>
              <AddExercisePicker
                householdId={householdId}
                disabled={
                  disabled ||
                  starting ||
                  editor.hasChanges ||
                  mediaBusy.size > 0 ||
                  exercises.length >= 40
                }
                onSelect={(exercise) => {
                  const id = crypto.randomUUID();
                  editor.change(
                    (rows) => [
                      ...rows,
                      {
                        id,
                        catalogExerciseId: exercise.id,
                        name: exercise.name,
                        unit: exercise.unit,
                        load: exercise.load,
                        unilateral: exercise.unilateral,
                        sets: 2,
                        target: "8–12",
                        role: "workout",
                      },
                    ],
                    true,
                  );
                  setEditingId(id);
                }}
              />
            </>
          )}
        </div>
      </div>
      <fieldset
        disabled={disabled || starting}
        className="min-w-0 divide-y divide-border"
      >
        {(logging ? current : exercises).map((exercise) => (
          <WorkoutExerciseRow
            key={exercise.id}
            householdId={householdId}
            exercise={exercise}
            disabled={
              disabled ||
              starting ||
              (mediaBusy.size > 0 && editingId !== exercise.id)
            }
            editing={!logging && editingId === exercise.id}
            logging={logging}
            mediaBusy={mediaBusy.has(exercise.id)}
            onMediaBusyChange={mediaWorkChanged}
            onEdit={() => {
              void beginEditing(exercise.id);
            }}
            onDone={async () => {
              if (mediaBusy.size > 0 || !(await editor.flush())) {
                return false;
              }
              setEditingId(undefined);
              return true;
            }}
            onDiscard={editor.revert}
            canDiscard={editor.hasChanges && !editor.isSaving && !editor.error}
            onChange={(patch, immediate) =>
              change(exercise.id, patch, immediate)
            }
            onRemove={async () => {
              editor.change(
                (rows) => rows.filter((row) => row.id !== exercise.id),
                true,
              );
              return editor.flush();
            }}
          />
        ))}
      </fieldset>
      {editor.error && (
        <InlineAlert role="alert" variant="danger">
          {editor.error}
          <TextDraftActions editor={definitionDraft} />
        </InlineAlert>
      )}
    </section>
  );
}
