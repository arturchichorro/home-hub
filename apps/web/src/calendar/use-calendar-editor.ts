import {
  type CalendarFields,
  calendarChanges,
  calendarFieldsSchema,
  cleanCalendarTitle,
} from "@home-hub/shared/calendar";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBlockAppUpdate } from "../updates/activity";

export type CalendarDraft = CalendarFields & { people: string[] };
export type CalendarSaveResult = {
  confirmed: CalendarDraft | undefined;
  error?: string;
};
const fields = ["title", "note", "day", "people"] as const;
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const matchesField = (
  field: (typeof fields)[number],
  a: CalendarDraft,
  b: CalendarDraft,
) =>
  field === "title"
    ? cleanCalendarTitle(a.title) === cleanCalendarTitle(b.title)
    : equal(a[field], b[field]);

export function useCalendarEditor({
  initial,
  current,
  persisted = false,
  enabled,
  save,
}: {
  initial: CalendarDraft;
  current: CalendarDraft | undefined;
  enabled: boolean;
  persisted?: boolean;
  save: (
    next: CalendarDraft,
    previous: CalendarDraft | undefined,
  ) => Promise<CalendarSaveResult>;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string>();
  const [isSaving, setSaving] = useState(false);
  const draft = useRef(initial);
  const confirmed = useRef(current ?? (persisted ? initial : undefined));
  const pending = useRef<Promise<boolean> | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const options = useRef({ enabled, save });
  options.current = { enabled, save };
  const changed = (next: CalendarDraft) =>
    fields.some(
      (field) => !matchesField(field, next, confirmed.current ?? initial),
    );
  const hasChanges = isSaving || changed(value);
  useBlockAppUpdate(hasChanges);

  const publish = useCallback((next: CalendarDraft) => {
    draft.current = next;
    if (mounted.current) {
      setValue(next);
    }
  }, []);
  const clear = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  const flush = useCallback((): Promise<boolean> => {
    clear();
    if (pending.current) {
      return pending.current;
    }
    const run = async () => {
      while (true) {
        const raw = draft.current;
        const parsed = calendarFieldsSchema.safeParse(raw);
        const previous = confirmed.current;
        if (!parsed.success) {
          // Opening an untouched empty dialog is harmless; any real draft needs resolving.
          if (
            !previous &&
            fields.every((field) => matchesField(field, raw, initial))
          ) {
            return true;
          }
          setError(
            "A title, valid day and note within the limits are required. Your changes are still here.",
          );
          return false;
        }
        const next = { ...parsed.data, people: raw.people };
        if (
          previous &&
          Object.keys(calendarChanges(next, previous)).length === 0 &&
          equal(next.people, previous.people)
        ) {
          return true;
        }
        if (!options.current.enabled) {
          setError(
            "Unable to save while disconnected or unavailable. Your changes are still here.",
          );
          return false;
        }
        setSaving(true);
        setError(undefined);
        let result: CalendarSaveResult;
        try {
          result = await options.current.save(next, previous);
        } catch {
          result = {
            confirmed: previous,
            error: "Unable to save. Your changes are still here.",
          };
        }
        confirmed.current = result.confirmed;
        if (result.error) {
          if (mounted.current) {
            setError(result.error);
          }
          return false;
        }
        // Keep title whitespace/caret intact while typing; compare its canonical value for dirtiness.
        const merged = { ...draft.current };
        for (const field of fields) {
          if (field !== "title" && equal(merged[field], raw[field])) {
            Object.assign(merged, {
              [field]: result.confirmed?.[field] ?? next[field],
            });
          }
        }
        publish(merged);
      }
    };
    pending.current = run().finally(() => {
      pending.current = undefined;
      if (mounted.current) {
        setSaving(false);
      }
    });
    return pending.current;
  }, [clear, initial, publish]);

  const currentJson = JSON.stringify(current);
  useEffect(() => {
    if (isSaving || pending.current || !confirmed.current || !currentJson) {
      return;
    }
    const next: CalendarDraft = JSON.parse(currentJson);
    const merged = { ...draft.current };
    for (const field of fields) {
      if (
        matchesField(field, merged, confirmed.current) &&
        !(field === "title" && cleanCalendarTitle(merged.title) === next.title)
      ) {
        Object.assign(merged, { [field]: next[field] });
      }
    }
    confirmed.current = next;
    publish(merged);
  }, [currentJson, isSaving, publish]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clear();
    };
  }, [clear]);
  useEffect(() => {
    if (!enabled) {
      clear();
    }
  }, [enabled, clear]);

  return {
    value,
    error,
    isSaving,
    hasChanges,
    saved: Boolean(confirmed.current),
    flush,
    change(patch: Partial<CalendarDraft>, immediate = false) {
      publish({ ...draft.current, ...patch });
      setError(undefined);
      clear();
      if (draft.current.title.trim()) {
        timer.current = setTimeout(() => void flush(), immediate ? 0 : 600);
      }
    },
    retry: () => void flush(),
    discard() {
      clear();
      publish(confirmed.current ?? initial);
      setError(undefined);
    },
  };
}
