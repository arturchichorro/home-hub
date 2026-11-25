import { useEffect, useRef, useState } from "react";
import { ContactConflict } from "./mutations";

export type RecordSnapshot<F> = { id: string; version: number; fields: F };

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

export function useContactRecord<F>({
  current,
  initial,
  enabled,
  externalSaving = false,
  save,
  validate,
  onWork,
}: {
  current: RecordSnapshot<F> | null | undefined;
  initial: F;
  enabled: boolean;
  externalSaving?: boolean;
  save: (
    value: F,
    base: RecordSnapshot<F> | null,
    writeId: string,
    prepare: boolean,
  ) => Promise<RecordSnapshot<F> | null>;
  validate: (value: F) => F;
  onWork: (dirty: boolean, saving: boolean) => void;
}) {
  const [, refresh] = useState(0);
  const s = useRef({
    value: current?.fields ?? initial,
    base: current ?? null,
    saving: false,
    error: undefined as string | undefined,
    conflict: undefined as RecordSnapshot<F> | null | undefined,
    pending: undefined as { key: string; writeId: string } | undefined,
    echo: false,
  }).current;
  const props = useRef({
    enabled,
    externalSaving,
    save,
    validate,
    onWork,
    current,
  });
  props.current = { enabled, externalSaving, save, validate, onWork, current };
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saving = useRef<Promise<boolean> | undefined>(undefined);
  const dirty = () => {
    let canonical = s.value;
    try {
      canonical = props.current.validate(s.value);
    } catch {
      return true;
    }
    return (
      !same(canonical, s.base?.fields ?? initial) ||
      s.conflict !== undefined ||
      Boolean(s.error)
    );
  };
  const cancel = () => {
    clearTimeout(timer.current);
  };
  const notify = () => {
    if (mounted.current) {
      refresh((n) => n + 1);
      props.current.onWork(dirty(), s.saving);
    }
  };
  function adopt(record: RecordSnapshot<F> | null) {
    s.base = record;
    s.value = record?.fields ?? initial;
    s.conflict = undefined;
    s.error = undefined;
    s.pending = undefined;
    s.echo = false;
  }
  function sync(
    record: RecordSnapshot<F> | null | undefined,
    authoritative = false,
  ) {
    if (record === undefined || s.saving || props.current.externalSaving) {
      return;
    }
    if (
      !authoritative &&
      s.echo &&
      record &&
      record.version < (s.base?.version ?? 0)
    ) {
      return;
    }
    if (
      record?.id === s.base?.id &&
      record?.version === s.base?.version &&
      same(record?.fields, s.base?.fields)
    ) {
      s.echo = false;
      return;
    }
    s.echo = false;
    if (dirty()) {
      cancel();
      s.conflict = record;
      s.error = "Changed elsewhere. Your draft is retained.";
    } else {
      adopt(record);
    }
    notify();
  }
  const syncRef = useRef(sync);
  syncRef.current = sync;
  async function perform(
    prepare: boolean,
    quietValidation: boolean,
  ): Promise<boolean> {
    if (s.conflict !== undefined) {
      return false;
    }
    if (!props.current.enabled) {
      s.error = "Reconnect or restore access to save.";
      notify();
      return false;
    }
    let value: F;
    try {
      value = props.current.validate(s.value);
    } catch (error) {
      if (!quietValidation) {
        s.error =
          error instanceof Error
            ? error.message
            : "Check the incomplete fields";
      }
      notify();
      return false;
    }
    if (same(value, s.base?.fields ?? initial) && (!prepare || s.base)) {
      s.error = undefined;
      notify();
      return true;
    }
    const key = JSON.stringify([value, s.base?.version ?? null, prepare]);
    if (s.pending?.key !== key) {
      s.pending = { key, writeId: crypto.randomUUID() };
    }
    s.saving = true;
    s.error = undefined;
    notify();
    try {
      const record = await props.current.save(
        value,
        s.base,
        s.pending.writeId,
        prepare,
      );
      if (!mounted.current) {
        return false;
      }
      s.base = record;
      s.pending = undefined;
      s.echo = true;
      // Keep focused text/caret verbatim; dirty comparison uses validated canonical fields.
      return true;
    } catch (error) {
      if (error instanceof ContactConflict) {
        s.conflict = error.record as RecordSnapshot<F> | null;
      }
      s.error =
        error instanceof ContactConflict
          ? "Changed elsewhere. Your draft is retained."
          : error instanceof Error
            ? error.message
            : "Unable to save. Your draft is retained.";
      return false;
    } finally {
      s.saving = false;
      notify();
    }
  }
  async function flush(
    prepare = false,
    quietValidation = false,
  ): Promise<boolean> {
    cancel();
    while (saving.current) {
      if (!(await saving.current)) {
        // A quiet validation failure has no reported error. An explicit action
        // must validate again rather than silently inheriting that failure.
        if (
          quietValidation ||
          s.error !== undefined ||
          s.conflict !== undefined
        ) {
          return false;
        }
      }
    }
    if (!dirty() && (!prepare || s.base)) {
      return true;
    }
    const promise = perform(prepare, quietValidation);
    saving.current = promise;
    const result = await promise;
    saving.current = undefined;
    if (result && dirty()) {
      return flush(prepare, quietValidation);
    }
    return result;
  }
  const flushRef = useRef(flush);
  flushRef.current = flush;
  const key =
    current === undefined
      ? "loading"
      : current
        ? JSON.stringify(current)
        : "none";
  const isSaving = s.saving;
  useEffect(() => {
    void key;
    // Acknowledgement may keep the same version as the optimistic query echo.
    if (!isSaving && !externalSaving) {
      syncRef.current(props.current.current);
    }
  }, [key, isSaving, externalSaving]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      props.current.onWork(false, false);
    };
  }, []);
  return {
    get value() {
      return s.value;
    },
    get base() {
      return s.base;
    },
    get error() {
      return s.error;
    },
    get hasChanges() {
      return dirty();
    },
    get isSaving() {
      return s.saving;
    },
    get conflict() {
      return s.conflict;
    },
    change(value: F) {
      s.value = value;
      if (s.conflict === undefined) {
        s.error = undefined;
      }
      cancel();
      notify();
      if (s.conflict === undefined) {
        // Incomplete typing is a draft, not a failed save. Explicit flushes
        // still report validation; transport errors and conflicts remain visible.
        timer.current = setTimeout(
          () => void flushRef.current(false, true),
          600,
        );
      }
    },
    flush: (prepare = false) => flush(prepare),
    retry: () => void flush(),
    discard() {
      cancel();
      adopt(
        s.conflict !== undefined
          ? s.conflict
          : (props.current.current ?? s.base),
      );
      notify();
    },
    replace() {
      if (s.conflict === undefined || s.conflict === null || s.saving) {
        return;
      }
      s.base = s.conflict;
      s.conflict = undefined;
      s.error = undefined;
      s.pending = undefined;
      notify();
      void flush();
    },
    reconcile(record: RecordSnapshot<F> | null) {
      sync(record, true);
    },
    accept(record: RecordSnapshot<F> | null) {
      adopt(record);
      s.echo = true;
      notify();
    },
  };
}
