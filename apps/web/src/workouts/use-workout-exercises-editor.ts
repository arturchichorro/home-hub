import {
  type WorkoutExercise,
  workoutExercisesSchema,
} from "@home-hub/shared/workouts";
import { useCallback, useEffect, useRef, useState } from "react";

import { useBlockAppUpdate } from "../updates/activity";
// Keep focused drafts intact, serialize saves, and drain edits made during a save.
export function useWorkoutExercisesEditor({
  current,
  enabled,
  save,
}: {
  current: readonly WorkoutExercise[];
  enabled: boolean;
  save: (
    exercises: WorkoutExercise[],
    previous: readonly WorkoutExercise[],
  ) => Promise<boolean>;
}) {
  const [exercises, setExercises] = useState<WorkoutExercise[]>([...current]);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const draft = useRef<readonly WorkoutExercise[]>(current);
  const confirmed = useRef(JSON.stringify(current));
  useBlockAppUpdate(
    isSaving || JSON.stringify(exercises) !== confirmed.current,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<Promise<boolean> | undefined>(undefined);
  const mounted = useRef(true);
  const enabledRef = useRef(enabled);
  const saveRef = useRef(save);
  enabledRef.current = enabled;
  saveRef.current = save;
  const clearTimer = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  const flush = useCallback((): Promise<boolean> => {
    clearTimer();
    if (pending.current) return pending.current;
    const run = async () => {
      while (JSON.stringify(draft.current) !== confirmed.current) {
        if (!enabledRef.current) return false;
        const submitted = JSON.stringify(draft.current);
        const parsed = workoutExercisesSchema.safeParse(draft.current);
        if (!parsed.success) {
          if (mounted.current) setError("Check exercise names and set counts.");
          return false;
        }
        if (mounted.current) {
          setIsSaving(true);
          setError("");
        }
        let success = false;
        try {
          success = await saveRef.current(
            parsed.data,
            workoutExercisesSchema.parse(JSON.parse(confirmed.current)),
          );
        } catch {
          /* Keep the draft for retry. */
        }
        if (!success) {
          if (JSON.stringify(draft.current) !== submitted) continue;
          if (mounted.current)
            setError("Unable to save exercises. Your changes are still here.");
          return false;
        }
        confirmed.current = submitted;
      }
      return true;
    };
    pending.current = run().finally(() => {
      pending.current = undefined;
      if (mounted.current) setIsSaving(false);
    });
    return pending.current;
  }, [clearTimer]);
  const currentJson = JSON.stringify(current);
  useEffect(() => {
    if (
      isSaving ||
      pending.current ||
      JSON.stringify(draft.current) !== confirmed.current
    )
      return;
    const next = workoutExercisesSchema.parse(JSON.parse(currentJson));
    draft.current = next;
    confirmed.current = currentJson;
    setExercises(next);
  }, [currentJson, isSaving]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimer();
    };
  }, [clearTimer]);
  useEffect(() => {
    if (!enabled) clearTimer();
    else if (JSON.stringify(draft.current) !== confirmed.current) void flush();
  }, [enabled, clearTimer, flush]);
  function change(
    update:
      | readonly WorkoutExercise[]
      | ((rows: readonly WorkoutExercise[]) => readonly WorkoutExercise[]),
    immediate = false,
  ) {
    const next = typeof update === "function" ? update(draft.current) : update;
    draft.current = next;
    setExercises([...next]);
    setError("");
    clearTimer();
    timer.current = setTimeout(
      () => {
        void flush();
      },
      immediate ? 0 : 600,
    );
  }
  return { exercises, change, flush, error, isSaving };
}
