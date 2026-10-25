import type { WorkoutExercise } from "@home-hub/shared/workouts";
import {
  Button,
  Check,
  ErrorPopover,
  IconButton,
  InlineAlert,
  Input,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
  Play,
  Plus,
  SelectItem,
  SelectPopup,
  SelectRoot,
  SelectTrigger,
  Settings,
  Textarea,
  Trash2,
  X,
} from "@home-hub/ui-web";
import { useEffect, useRef, useState } from "react";
import { useDebouncedTextEditor } from "../recipes/use-debounced-text-editor";

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
            if (!readOnly) editor.handleKeyDown(e, false);
          }}
        />
      ) : (
        <Input
          {...props}
          ref={input}
          maxLength={150}
          className="text-2xl font-semibold text-primary"
          onValueChange={editor.changeValue}
          onKeyDown={(e) => {
            if (!readOnly) editor.handleKeyDown(e, true);
          }}
        />
      )}
      <ErrorPopover
        anchor={multiline ? textarea : input}
        id={editor.errorId}
        open={editor.error !== undefined}
        onDismiss={editor.dismissError}
      >
        {editor.error}
      </ErrorPopover>
    </>
  );
}

import { useWorkoutExercisesEditor } from "./use-workout-exercises-editor";
import { WorkoutExerciseSets, type WorkoutLogging } from "./workout-log";

export function WorkoutExercises({
  current,
  disabled,
  onSave,
  logging,
  onStartLogging,
  onCloseLogging,
  onCompleteLogging,
}: {
  current: readonly WorkoutExercise[];
  disabled: boolean;
  onSave: (exercises: WorkoutExercise[]) => Promise<boolean>;
  logging?: WorkoutLogging | undefined;
  onStartLogging: () => Promise<void>;
  onCloseLogging: () => void;
  onCompleteLogging: () => void;
}) {
  const [starting, setStarting] = useState(false);
  const editor = useWorkoutExercisesEditor({
    current,
    enabled: !disabled && !logging,
    save: onSave,
  });
  const exercises = editor.exercises;
  function change(
    id: string,
    patch: Partial<WorkoutExercise>,
    immediate = false,
  ) {
    editor.change(
      (rows) => rows.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      immediate,
    );
  }
  return (
    <section
      aria-label="Workout exercises"
      className="grid min-w-0 gap-0"
      aria-busy={editor.isSaving || starting || undefined}
      onBlurCapture={() => {
        if (!logging) void editor.flush();
      }}
      onKeyDown={(event) => {
        if (
          !logging &&
          event.key === "Enter" &&
          event.target instanceof HTMLInputElement
        ) {
          event.preventDefault();
          if (!disabled && !starting) void editor.flush();
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2 py-1">
        <h2 className="flex-1 font-semibold">Exercises</h2>
        {logging ? (
          <>
            {logging.form.completedOn && (
              <span className="text-xs text-muted">
                {logging.form.completedOn}
              </span>
            )}
            <Button
              size="compact"
              disabled={disabled}
              onClick={onCompleteLogging}
            >
              <Check aria-hidden="true" className="size-4" />
              Done
            </Button>
            <IconButton
              aria-label="Cancel log"
              title="Cancel log"
              className="size-7!"
              onClick={onCloseLogging}
            >
              <X aria-hidden="true" className="size-4" />
            </IconButton>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              className="h-7! px-1! font-normal text-muted"
              disabled={disabled || starting}
              onClick={async () => {
                setStarting(true);
                try {
                  if (await editor.flush()) await onStartLogging();
                } finally {
                  setStarting(false);
                }
              }}
            >
              <Play aria-hidden="true" className="size-4" />
              Log workout
            </Button>
            <IconButton
              aria-label="Add exercise"
              title="Add exercise"
              className="size-7!"
              disabled={disabled || starting || exercises.length >= 40}
              onClick={() =>
                editor.change(
                  (rows) => [
                    ...rows,
                    {
                      id: crypto.randomUUID(),
                      name: "New exercise",
                      sets: 2,
                      target: "8–12",
                      unit: "reps",
                      unilateral: false,
                      load: "per-hand",
                    },
                  ],
                  true,
                )
              }
            >
              <Plus aria-hidden="true" className="size-4" />
            </IconButton>
          </>
        )}
      </div>
      <fieldset
        disabled={disabled || starting}
        className="min-w-0 divide-y divide-border"
      >
        {(logging ? current : exercises).map((exercise) => (
          <div
            key={exercise.id}
            data-exercise-id={exercise.id}
            className="grid min-w-0 gap-0 py-1"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Input
                appearance="seamless"
                aria-label={`Name for ${exercise.name}`}
                className="h-7!"
                readOnly={!!logging}
                value={exercise.name}
                maxLength={150}
                required
                onValueChange={(name) => change(exercise.id, { name })}
              />
              {!logging && (
                <>
                  <ExerciseSettings
                    exercise={exercise}
                    disabled={disabled || starting}
                    onChange={(patch) => change(exercise.id, patch, true)}
                  />
                  <IconButton
                    aria-label={`Remove ${exercise.name}`}
                    title="Remove exercise"
                    className="size-7!"
                    onClick={() =>
                      editor.change(
                        (rows) => rows.filter((e) => e.id !== exercise.id),
                        true,
                      )
                    }
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </IconButton>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <div className="flex items-center gap-1">
                <Input
                  appearance="seamless"
                  aria-label={`Sets for ${exercise.name}`}
                  className="h-8! w-8 flex-none! text-sm"
                  readOnly={!!logging}
                  type="number"
                  min="1"
                  max="10"
                  required
                  value={exercise.sets || ""}
                  onValueChange={(v) =>
                    change(exercise.id, { sets: Number(v) })
                  }
                />
                <span>sets ×</span>
              </div>
              <Input
                appearance="seamless"
                aria-label={`Target for ${exercise.name}`}
                className="h-8! w-16 flex-none! text-sm"
                readOnly={!!logging}
                maxLength={100}
                value={exercise.target}
                onValueChange={(target) => change(exercise.id, { target })}
              />
              <SelectRoot
                value={exercise.unit}
                disabled={disabled || starting || !!logging}
                items={[
                  { value: "reps", label: "Reps" },
                  { value: "seconds", label: "Seconds" },
                ]}
                onValueChange={(unit) => {
                  if (unit === "reps" || unit === "seconds")
                    change(exercise.id, { unit }, true);
                }}
              >
                <SelectTrigger
                  aria-label={`Measure for ${exercise.name}`}
                  className="h-8! w-28! gap-2! px-2! text-xs"
                />
                <SelectPopup>
                  <SelectItem value="reps">Reps</SelectItem>
                  <SelectItem value="seconds">Seconds</SelectItem>
                </SelectPopup>
              </SelectRoot>
            </div>
            {logging && (
              <WorkoutExerciseSets
                exercise={exercise}
                logging={logging}
                disabled={disabled || starting}
              />
            )}
          </div>
        ))}
      </fieldset>
      {editor.error && (
        <InlineAlert role="alert" variant="danger">
          {editor.error}
          <Button
            variant="ghost"
            size="compact"
            onClick={() => void editor.flush()}
            disabled={disabled || starting}
          >
            Retry
          </Button>
        </InlineAlert>
      )}
    </section>
  );
}
function ExerciseSettings({
  exercise,
  disabled,
  onChange,
}: {
  exercise: WorkoutExercise;
  disabled: boolean;
  onChange: (patch: Partial<WorkoutExercise>) => void;
}) {
  return (
    <MenuRoot>
      <MenuTrigger
        aria-label={`Settings for ${exercise.name}`}
        title="Exercise settings"
        disabled={disabled}
        render={
          <IconButton
            aria-label={`Settings for ${exercise.name}`}
            className="size-7!"
          >
            <Settings aria-hidden="true" className="size-4" />
          </IconButton>
        }
      />
      <MenuPopup align="end">
        <div className="px-3 py-1 text-xs text-muted">Load</div>
        <MenuRadioGroup
          aria-label="Load"
          value={exercise.load}
          onValueChange={(load) => {
            if (
              load === "per-hand" ||
              load === "single" ||
              load === "bodyweight"
            )
              onChange({ load });
          }}
        >
          <MenuRadioItem closeOnClick={false} value="per-hand">
            kg per hand
          </MenuRadioItem>
          <MenuRadioItem closeOnClick={false} value="single">
            kg single dumbbell
          </MenuRadioItem>
          <MenuRadioItem closeOnClick={false} value="bodyweight">
            Bodyweight
          </MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuRadioGroup
          aria-label="Sides"
          value={exercise.unilateral ? "each" : "together"}
          onValueChange={(side) => onChange({ unilateral: side === "each" })}
        >
          <MenuRadioItem closeOnClick={false} value="together">
            Both sides together
          </MenuRadioItem>
          <MenuRadioItem closeOnClick={false} value="each">
            Each side
          </MenuRadioItem>
        </MenuRadioGroup>
      </MenuPopup>
    </MenuRoot>
  );
}
