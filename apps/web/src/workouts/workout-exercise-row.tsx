import {
  type WorkoutExercise,
  workoutExerciseRoleLabel,
} from "@home-hub/shared/workouts";
import { Button, Input } from "@home-hub/ui-web";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ExerciseDetailLink } from "./exercise-detail-link";
import { ExerciseMedia } from "./exercise-media";
import { ExerciseRow, ExerciseRowActions } from "./exercise-row";
import { ExerciseSettings } from "./exercise-settings";
import {
  LoggedExerciseRemove,
  WorkoutExerciseSets,
  type WorkoutLogging,
} from "./workout-log";

export function WorkoutExerciseRow({
  householdId,
  exercise,
  disabled,
  editing,
  logging,
  mediaBusy,
  onMediaBusyChange,
  onEdit,
  onDone,
  onDiscard,
  onChange,
  onRemove,
  canDiscard,
}: {
  canDiscard: boolean;
  householdId: string;
  exercise: WorkoutExercise;
  disabled: boolean;
  editing: boolean;
  logging?: WorkoutLogging | undefined;
  mediaBusy: boolean;
  onMediaBusyChange: (id: string, busy: boolean) => void;
  onEdit: () => void;
  onDone: () => Promise<boolean>;
  onDiscard: () => void;
  onChange: (patch: Partial<WorkoutExercise>, immediate?: boolean) => void;
  onRemove: () => Promise<boolean>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const fieldsId = useId();
  const mediaWorkChanged = useCallback(
    (busy: boolean) => onMediaBusyChange(exercise.id, busy),
    [onMediaBusyChange, exercise.id],
  );
  const actions = useRef<HTMLSpanElement>(null);
  const [finishing, setFinishing] = useState(false);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!editing && !logging && !finishing && restoreFocus.current) {
      restoreFocus.current = false;
      requestAnimationFrame(() =>
        actions.current?.querySelector("button")?.focus(),
      );
    }
  }, [editing, logging, finishing]);

  async function done() {
    if (mediaBusy || finishing) {
      return;
    }

    restoreFocus.current = true;
    setFinishing(true);
    const saved = await onDone();
    setFinishing(false);
    if (!saved) {
      restoreFocus.current = false;
      input.current?.focus();
    }
  }

  const title = editing ? (
    <Input
      ref={input}
      appearance="seamless"
      aria-label={`Name for ${exercise.name}`}
      className="h-8! w-full font-medium"
      autoFocus
      value={exercise.name}
      maxLength={150}
      required
      disabled={disabled}
      onValueChange={(name) => onChange({ name })}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onDiscard();
        }
      }}
    />
  ) : exercise.catalogExerciseId ? (
    <ExerciseDetailLink
      text
      householdId={householdId}
      exerciseId={exercise.catalogExerciseId}
      name={exercise.name}
    />
  ) : (
    <span className="break-words">{exercise.name}</span>
  );

  return (
    <div data-exercise-id={exercise.id}>
      <ExerciseRow
        editing={editing}
        media={
          exercise.catalogExerciseId ? (
            <ExerciseMedia
              leading
              householdId={householdId}
              exerciseId={exercise.catalogExerciseId}
              name={exercise.name}
              readOnly={!editing || !!logging}
              disabled={disabled}
              onBusyChange={mediaWorkChanged}
            />
          ) : (
            <div
              aria-hidden="true"
              className="size-12 rounded-lg bg-raised/50"
            />
          )
        }
        heading={title}
        actions={
          editing ? (
            <>
              <ExerciseSettings
                exercise={exercise}
                disabled={disabled || mediaBusy}
                includeMeasure
                role={exercise.role ?? "workout"}
                onRoleChange={(role) => onChange({ role }, true)}
                onChange={(patch) => onChange(patch, true)}
              />
              {canDiscard && (
                <Button
                  size="compact"
                  variant="ghost"
                  disabled={mediaBusy}
                  onClick={onDiscard}
                >
                  Discard
                </Button>
              )}
              <Button
                size="compact"
                variant="ghost"
                disabled={mediaBusy}
                busy={finishing}
                onClick={() => void done()}
              >
                Done
              </Button>
            </>
          ) : (
            <span ref={actions}>
              {logging ? (
                <LoggedExerciseRemove
                  exercise={exercise}
                  logging={logging}
                  disabled={disabled}
                />
              ) : (
                <ExerciseRowActions
                  name={exercise.name}
                  disabled={disabled || mediaBusy}
                  onEdit={onEdit}
                  onRemove={onRemove}
                  removeLabel="Remove"
                  message={`Remove “${exercise.name}” from this workout?`}
                />
              )}
            </span>
          )
        }
        metadata={
          !logging?.freeForm &&
          !editing && (
            <p className="break-words whitespace-pre-wrap">
              {exercise.sets} sets
              {exercise.target ? ` × ${exercise.target} ${exercise.unit}` : ""}
              {exercise.role && exercise.role !== "workout"
                ? ` · ${workoutExerciseRoleLabel(exercise.role)}`
                : ""}
            </p>
          )
        }
      >
        {editing && (
          <div className="flex min-w-0 flex-wrap items-end gap-4 pb-1 pl-1">
            <label
              htmlFor={`${fieldsId}-sets`}
              className="grid gap-1 text-xs text-muted"
            >
              <span>Sets</span>
              <Input
                appearance="seamless"
                id={`${fieldsId}-sets`}
                aria-label={`Sets for ${exercise.name}`}
                className="h-8! w-14 flex-none! text-sm text-foreground"
                type="number"
                min="1"
                max="10"
                required
                value={exercise.sets || ""}
                disabled={disabled}
                onValueChange={(value) => onChange({ sets: Number(value) })}
              />
            </label>
            <label
              htmlFor={`${fieldsId}-target`}
              className="grid min-w-0 gap-1 text-xs text-muted"
            >
              <span>Target ({exercise.unit})</span>
              <Input
                appearance="seamless"
                id={`${fieldsId}-target`}
                aria-label={`Target for ${exercise.name}`}
                className="h-8! w-40 max-w-full flex-none! text-sm text-foreground"
                maxLength={100}
                value={exercise.target}
                disabled={disabled}
                onValueChange={(target) => onChange({ target })}
              />
            </label>
          </div>
        )}
        {logging && (
          <WorkoutExerciseSets
            exercise={exercise}
            logging={logging}
            disabled={disabled}
          />
        )}
      </ExerciseRow>
    </div>
  );
}
