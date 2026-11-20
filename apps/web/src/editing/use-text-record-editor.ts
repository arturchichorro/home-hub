import { useCallback, useEffect, useRef, useState } from "react";
import { useBlockAppUpdate } from "../updates/activity";

type Options<T> = {
  initial: T;
  persisted: boolean;
  current: T | undefined;
  enabled: boolean;
  prepare: (value: T) => T | undefined;
  invalidError: string;
  save: (next: T, previous: T | undefined) => Promise<void>;
};

// Small multi-field draft controller: serialize saves, patch independent fields,
// retain exact text/caret and merge only remote fields not edited locally.
export function useTextRecordEditor<T extends Record<string, string>>(
  options: Options<T>,
) {
  const [initial] = useState(options.initial);
  const keys = Object.keys(initial) as (keyof T)[];
  function fieldsOnly(source: T): T {
    const result = { ...initial };
    for (const key of keys) {
      result[key] = source[key];
    }
    return result;
  }
  const confirmed = useRef(
    options.current
      ? fieldsOnly(options.current)
      : options.persisted
        ? initial
        : undefined,
  );
  const draft = useRef(initial);
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string>();
  const [isSaving, setSaving] = useState(false);
  const pending = useRef<Promise<boolean> | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const latest = useRef(options);
  latest.current = options;

  const matches = (left: T, right: T) =>
    keys.every(
      (key) =>
        (latest.current.prepare(left) ?? left)[key] ===
        (latest.current.prepare(right) ?? right)[key],
    );
  const changed = (next: T) => !matches(next, confirmed.current ?? initial);
  const hasChanges = isSaving || changed(value);
  useBlockAppUpdate(hasChanges);

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  const publish = useCallback((next: T) => {
    draft.current = next;

    if (mounted.current) {
      setValue(next);
    }
  }, []);
  const flush = useCallback((): Promise<boolean> => {
    clear();

    if (pending.current) {
      return pending.current;
    }

    const run = async () => {
      while (true) {
        const raw = draft.current;
        const next = latest.current.prepare(raw);
        const previous = confirmed.current;

        if (!next) {
          if (
            !previous &&
            Object.keys(initial).every((key) => raw[key] === initial[key])
          ) {
            return true;
          }
          setError(latest.current.invalidError);
          return false;
        }

        if (
          previous &&
          Object.keys(next).every((key) => next[key] === previous[key])
        ) {
          return true;
        }
        if (!latest.current.enabled) {
          setError(
            "Unable to save while disconnected or unavailable. Your changes are still here.",
          );
          return false;
        }

        setSaving(true);
        setError(undefined);

        try {
          await latest.current.save(next, previous);
        } catch {
          if (mounted.current) {
            setError("Unable to save. Your changes are still here.");
          }
          return false;
        }

        confirmed.current = next;
        // The draft remains exactly as typed; normalization is only compared when saving.
        if (mounted.current) {
          setValue({ ...draft.current });
        }
      }
    };

    pending.current = run().finally(() => {
      pending.current = undefined;

      if (mounted.current) {
        setSaving(false);
      }
    });

    return pending.current;
  }, [clear, initial]);

  const currentJson = JSON.stringify(
    options.current ? fieldsOnly(options.current) : undefined,
  );
  useEffect(() => {
    if (!currentJson || pending.current || isSaving || !confirmed.current) {
      return;
    }

    const next: T = JSON.parse(currentJson);
    const previous = confirmed.current;
    const merged = { ...draft.current };

    for (const key of Object.keys(initial) as (keyof T)[]) {
      const canonicalDraft =
        latest.current.prepare(draft.current) ?? draft.current;

      if (
        canonicalDraft[key] === previous[key] &&
        previous[key] !== next[key]
      ) {
        merged[key] = next[key];
      }
    }

    confirmed.current = next;
    publish(merged);
  }, [currentJson, initial, isSaving, publish]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clear();
    };
  }, [clear]);
  useEffect(() => {
    if (!options.enabled) {
      clear();
    }
  }, [options.enabled, clear]);

  return {
    value,
    error,
    isSaving,
    hasChanges,
    saved: confirmed.current !== undefined,
    flush,
    snapshot: () => ({
      value: { ...draft.current },
      saved: confirmed.current !== undefined,
      hasChanges: Boolean(pending.current) || changed(draft.current),
      isSaving: Boolean(pending.current),
    }),
    change(patch: Partial<T>) {
      publish({ ...draft.current, ...patch });
      setError(undefined);
      clear();

      if (latest.current.prepare(draft.current)) {
        timer.current = setTimeout(() => void flush(), 600);
      }
    },
    retry: () => void flush(),
    discard() {
      if (pending.current) {
        return;
      }
      clear();
      publish(confirmed.current ?? initial);
      setError(undefined);
    },
  };
}
