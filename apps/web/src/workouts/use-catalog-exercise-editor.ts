import {
  type CatalogExercise,
  exerciseCatalogSchema,
} from "@home-hub/shared/workouts";
import { useCallback, useEffect, useRef, useState } from "react";

import { useBlockAppUpdate } from "../updates/activity";
export type CatalogSaveResult =
  | { exercise: CatalogExercise }
  | { error: string };
const fields = ["name", "unit", "load", "unilateral"] as const;
export function useCatalogExerciseEditor({
  initial,
  current,
  enabled,
  save,
  onSaved,
}: {
  initial: CatalogExercise;
  current: CatalogExercise | undefined;
  enabled: boolean;
  save: (
    next: CatalogExercise,
    previous: CatalogExercise | undefined,
  ) => Promise<CatalogSaveResult>;
  onSaved: (id: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const draft = useRef(initial),
    confirmed = useRef(current);
  const pending = useRef<Promise<boolean> | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true),
    canonicalize = useRef(false);
  const options = useRef({ enabled, save, onSaved });
  useBlockAppUpdate(
    isSaving ||
      fields.some(
        (field) => value[field] !== (confirmed.current ?? initial)[field],
      ),
  );
  options.current = { enabled, save, onSaved };
  const publish = useCallback((next: CatalogExercise) => {
    draft.current = next;
    if (mounted.current) setValue(next);
  }, []);
  const clearTimer = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  const flush = useCallback(
    (finishName = true): Promise<boolean> => {
      clearTimer();
      canonicalize.current ||= finishName;
      if (pending.current) return pending.current;
      const run = async () => {
        while (true) {
          const raw = draft.current;
          const parsed = exerciseCatalogSchema.safeParse(raw);
          if (!parsed.success) {
            if (canonicalize.current && confirmed.current && !raw.name.trim()) {
              publish({ ...raw, name: confirmed.current.name });
              if (mounted.current) setError("An exercise name is required.");
            }
            return false;
          }
          const previous = confirmed.current;
          if (
            previous &&
            fields.every((field) => parsed.data[field] === previous[field])
          ) {
            if (canonicalize.current)
              publish({ ...draft.current, name: parsed.data.name });
            canonicalize.current = false;
            return true;
          }
          if (!options.current.enabled) return false;
          if (mounted.current) {
            setIsSaving(true);
            setError(undefined);
          }
          let result: CatalogSaveResult;
          try {
            result = await options.current.save(parsed.data, previous);
          } catch {
            result = {
              error: "Unable to save exercise. Your changes are still here.",
            };
          }
          if ("error" in result) {
            // A corrected name/settings draft can supersede a failed in-flight save.
            if (draft.current !== raw) continue;
            if (mounted.current) setError(result.error);
            return false;
          }
          confirmed.current = result.exercise;
          publish({
            ...draft.current,
            id: result.exercise.id,
            ...(canonicalize.current && draft.current.name === raw.name
              ? { name: parsed.data.name }
              : {}),
          });
          if (mounted.current) options.current.onSaved(result.exercise.id);
        }
      };
      pending.current = run().finally(() => {
        pending.current = undefined;
        if (mounted.current) setIsSaving(false);
      });
      return pending.current;
    },
    [clearTimer, publish],
  );
  const currentJson = JSON.stringify(current);
  useEffect(() => {
    if (isSaving || pending.current || !confirmed.current || !currentJson)
      return;
    const next = exerciseCatalogSchema.parse(JSON.parse(currentJson));
    const previous = confirmed.current;
    const merged = { ...draft.current, id: next.id };
    for (const field of fields) {
      if (draft.current[field] === previous[field])
        Object.assign(merged, { [field]: next[field] });
    }
    confirmed.current = next;
    publish(merged);
  }, [currentJson, isSaving, publish]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimer();
    };
  }, [clearTimer]);
  useEffect(() => {
    if (!enabled) clearTimer();
  }, [enabled, clearTimer]);
  function change(
    patch: Partial<
      Pick<CatalogExercise, "name" | "unit" | "load" | "unilateral">
    >,
    immediate = false,
  ) {
    if (patch.name !== undefined) canonicalize.current = false;
    publish({ ...draft.current, ...patch });
    setError(undefined);
    clearTimer();
    if (!draft.current.name.trim()) return;
    timer.current = setTimeout(() => void flush(false), immediate ? 0 : 600);
  }
  function revert() {
    clearTimer();
    canonicalize.current = false;
    publish(confirmed.current ?? initial);
    setError(undefined);
  }
  return {
    value,
    error,
    isSaving,
    persistedId: confirmed.current?.id,
    change,
    flush,
    revert,
    dismissError: () => setError(undefined),
  };
}
