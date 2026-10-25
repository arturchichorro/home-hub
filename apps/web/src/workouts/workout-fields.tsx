import {
  type WorkoutExercise,
  workoutExercisesSchema,
} from "@home-hub/shared/workouts";
import {
  Check,
  ErrorPopover,
  IconButton,
  InlineAlert,
  Input,
  Plus,
  Textarea,
  Trash2,
} from "@home-hub/ui-web";
import { useEffect, useRef, useState } from "react";
import { useDebouncedTextEditor } from "../recipes/use-debounced-text-editor";

export function WorkoutText({
  label,
  value,
  disabled,
  multiline = false,
  onSave,
}: {
  label: string;
  value: string;
  disabled: boolean;
  multiline?: boolean;
  onSave: (value: string) => Promise<boolean>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const editor = useDebouncedTextEditor({
    currentValue: value,
    mutationEnabled: !disabled,
    normalize: (v) => v.trim(),
    required: !multiline,
    failureError: "Unable to save.",
    save: onSave,
  });
  const props = {
    appearance: "seamless" as const,
    "aria-label": label,
    "aria-busy": editor.isSaving || undefined,
    "aria-invalid": editor.error ? (true as const) : undefined,
    "aria-errormessage": editor.error ? editor.errorId : undefined,
    disabled,
    value: editor.value,
    onBlur: editor.handleBlur,
  };
  return (
    <>
      {multiline ? (
        <Textarea
          {...props}
          ref={textarea}
          placeholder="Notes…"
          rows={1}
          maxLength={1000000}
          onChange={(e) => editor.changeValue(e.target.value)}
          onKeyDown={(e) => editor.handleKeyDown(e, false)}
        />
      ) : (
        <Input
          {...props}
          ref={input}
          maxLength={150}
          className="text-2xl font-semibold text-primary"
          onValueChange={editor.changeValue}
          onKeyDown={(e) => editor.handleKeyDown(e, true)}
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
export function WorkoutExercises({
  current,
  disabled,
  onSave,
}: {
  current: readonly WorkoutExercise[];
  disabled: boolean;
  onSave: (exercises: WorkoutExercise[]) => Promise<boolean>;
}) {
  const [exercises, setExercises] = useState<WorkoutExercise[]>([...current]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const currentJson = JSON.stringify(current);
  useEffect(() => {
    if (!dirty)
      setExercises(workoutExercisesSchema.parse(JSON.parse(currentJson)));
  }, [currentJson, dirty]);
  function change(id: string, patch: Partial<WorkoutExercise>) {
    setDirty(true);
    setExercises((rows) =>
      rows.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    );
  }
  return (
    <form
      className="grid min-w-0 gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const parsed = workoutExercisesSchema.safeParse(exercises);
        if (!parsed.success) {
          setError("Check exercise names and set counts.");
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
      <div className="flex items-center gap-2">
        <h2 className="flex-1 font-semibold">Exercises</h2>
        <IconButton
          aria-label="Add exercise"
          title="Add exercise"
          disabled={disabled || busy || exercises.length >= 40}
          onClick={() => {
            setDirty(true);
            setExercises((rows) => [
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
            ]);
          }}
        >
          <Plus aria-hidden="true" className="size-4" />
        </IconButton>
        <IconButton
          type="submit"
          aria-label="Save exercises"
          title="Save exercises"
          disabled={disabled || busy || !dirty}
        >
          <Check aria-hidden="true" className="size-4" />
        </IconButton>
      </div>
      <fieldset
        disabled={disabled || busy}
        className="min-w-0 divide-y divide-border"
      >
        {exercises.map((exercise) => (
          <div key={exercise.id} className="grid min-w-0 gap-1 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <Input
                appearance="seamless"
                aria-label={`Name for ${exercise.name}`}
                value={exercise.name}
                maxLength={150}
                required
                onValueChange={(name) => change(exercise.id, { name })}
              />
              <IconButton
                aria-label={`Remove ${exercise.name}`}
                title="Remove exercise"
                onClick={() => {
                  setDirty(true);
                  setExercises((rows) =>
                    rows.filter((e) => e.id !== exercise.id),
                  );
                }}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </IconButton>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
              <Input
                appearance="seamless"
                aria-label={`Sets for ${exercise.name}`}
                className="h-8! w-12 flex-none! text-sm"
                type="number"
                min="1"
                max="10"
                required
                value={exercise.sets || ""}
                onValueChange={(v) => change(exercise.id, { sets: Number(v) })}
              />
              <span>sets ×</span>
              <Input
                appearance="seamless"
                aria-label={`Target for ${exercise.name}`}
                className="h-8! w-20 flex-none! text-sm"
                maxLength={100}
                value={exercise.target}
                onValueChange={(target) => change(exercise.id, { target })}
              />
              <label className="sr-only" htmlFor={`unit-${exercise.id}`}>
                Measure for {exercise.name}
              </label>
              <select
                id={`unit-${exercise.id}`}
                className="min-h-8 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                value={exercise.unit}
                onChange={(e) =>
                  change(exercise.id, {
                    unit: e.target.value as WorkoutExercise["unit"],
                  })
                }
              >
                <option value="reps">reps</option>
                <option value="seconds">seconds</option>
              </select>
            </div>
            <details>
              <summary className="cursor-pointer py-1 text-xs text-muted">
                Logging options
              </summary>
              <div className="flex flex-wrap items-center gap-3 py-1 text-xs text-muted">
                <label className="flex items-center gap-2">
                  Load
                  <select
                    className="min-h-8 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    value={exercise.load}
                    onChange={(e) =>
                      change(exercise.id, {
                        load: e.target.value as WorkoutExercise["load"],
                      })
                    }
                  >
                    <option value="per-hand">kg per hand</option>
                    <option value="single">kg single dumbbell</option>
                    <option value="bodyweight">bodyweight</option>
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={exercise.unilateral}
                    onChange={(e) =>
                      change(exercise.id, { unilateral: e.target.checked })
                    }
                  />
                  Each side
                </label>
              </div>
            </details>
          </div>
        ))}
      </fieldset>
      {dirty && <p className="text-xs text-muted">Unsaved exercises</p>}
      {error && (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      )}
    </form>
  );
}
