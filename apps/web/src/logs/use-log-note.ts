import {
  cleanLogNote,
  type LogEntrySnapshot,
  type LogEntryWrite,
} from "@home-hub/shared/logs";
import { useEffect, useRef, useState } from "react";
import type { MediaSession } from "../media/session";
import { LogConflict, readLogEntry, writeLogEntry } from "./api";

const entryKey = (entry: LogEntrySnapshot | null) =>
  entry ? `${entry.id}:${entry.version}` : "none";

type State = {
  value: string;
  base: LogEntrySnapshot | null;
  saving: boolean;
  error: string | undefined;
  conflict: LogEntrySnapshot | null;
  hasConflict: boolean;
  echo: boolean;
  newId: string;
  pending: LogEntryWrite | undefined;
  queuedBlur: boolean;
};

export function useLogNote({
  entry,
  householdId,
  logId,
  entryOn,
  session,
  enabled,
  onWork,
}: {
  entry: LogEntrySnapshot | null;
  householdId: string;
  logId: string;
  entryOn: string;
  session: MediaSession;
  enabled: boolean;
  onWork: (busy: boolean) => void;
}) {
  const [, refresh] = useState(0);
  const state = useRef<State>({
    value: entry?.note ?? "",
    base: entry,
    saving: false,
    error: undefined,
    conflict: null,
    hasConflict: false,
    echo: false,
    newId: crypto.randomUUID(),
    pending: undefined,
    queuedBlur: false,
  });
  const props = useRef({ entry, session, enabled, onWork });
  props.current = { entry, session, enabled, onWork };

  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const echoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveRef = useRef<(blur: boolean) => Promise<void>>(async () => {});
  const syncRef = useRef<(incoming: LogEntrySnapshot | null) => void>(() => {});
  const dirty = () =>
    state.current.value !== (state.current.base?.note ?? "") ||
    state.current.hasConflict ||
    !!state.current.error;
  const notify = () => {
    if (mounted.current) {
      refresh((n) => n + 1);
      props.current.onWork(dirty() || state.current.saving);
    }
  };
  const cancel = () => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
  };

  function adopt(value: LogEntrySnapshot | null) {
    const s = state.current;
    s.base = value;
    s.value = value?.note ?? "";
    s.newId = crypto.randomUUID();
    s.error = undefined;
    s.hasConflict = false;
    s.conflict = null;
    s.pending = undefined;
    s.echo = false;
  }

  function synchronize(incoming: LogEntrySnapshot | null) {
    const s = state.current;

    if (s.saving) {
      return;
    }

    if (
      s.echo &&
      entryKey(incoming) !== entryKey(s.base) &&
      !(
        incoming &&
        s.base &&
        incoming.id === s.base.id &&
        incoming.version > s.base.version
      )
    ) {
      return;
    }

    s.echo = false;

    if (entryKey(incoming) === entryKey(s.base)) {
      return;
    }

    if (dirty()) {
      cancel();
      s.hasConflict = true;
      s.conflict = incoming;
      s.error = "Someone else changed this entry. Your draft is retained.";
    } else {
      adopt(incoming);
    }

    notify();
  }

  async function recoverEcho() {
    const s = state.current;

    if (!s.echo || s.saving) {
      return;
    }

    try {
      const current = await readLogEntry(props.current.session, {
        householdId,
        logId,
        entryOn,
      });

      if (!mounted.current || !s.echo) {
        return;
      }

      s.echo = false;
      synchronize(current);
    } catch {
      /* Live sync or an explicit Retry can recover after reconnect. */
    }
  }

  async function save(blur: boolean) {
    cancel();

    const s = state.current;

    if (s.saving) {
      s.queuedBlur ||= blur;

      return;
    }

    if (s.hasConflict) {
      return;
    }

    const note = cleanLogNote(s.value);
    const baseNote = s.base?.note ?? "";

    if (!note && !blur) {
      return; // Clearing is removal only when editing finishes.
    }

    if (note === baseNote) {
      s.value = note;
      s.error = undefined;
      notify();

      return;
    }

    if (!props.current.enabled) {
      s.error = "The note could not be saved. Reconnect to retry.";
      notify();

      return;
    }

    const raw = s.value;
    const prior = s.pending;
    const input: LogEntryWrite =
      prior &&
      prior.note === note &&
      prior.expectedVersion === (s.base?.version ?? null) &&
      prior.entryId === (s.base?.id ?? s.newId)
        ? prior
        : {
            householdId,
            logId,
            entryOn,
            entryId: s.base?.id ?? s.newId,
            expectedVersion: s.base?.version ?? null,
            writeId: crypto.randomUUID(),
            note,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          };
    s.pending = input;
    s.saving = true;
    s.error = undefined;
    notify();

    try {
      const saved = await writeLogEntry(props.current.session, input);

      if (!mounted.current) {
        return;
      }

      s.base = saved;
      s.newId = crypto.randomUUID();
      s.pending = undefined;
      s.echo = entryKey(props.current.entry) !== entryKey(saved);

      if (s.value === raw) {
        s.value = note;
      }

      s.error = undefined;
      s.hasConflict = false;
      s.conflict = null;

      if (s.echo) {
        if (echoTimer.current) {
          clearTimeout(echoTimer.current);
        }

        echoTimer.current = setTimeout(() => void recoverEcho(), 1000);
      }
    } catch (error) {
      if (!mounted.current) {
        return;
      }

      if (error instanceof LogConflict) {
        s.hasConflict = true;
        s.conflict = error.entry;
        s.error = "Someone else changed this entry. Your draft is retained.";
      } else {
        s.error = "The note could not be saved. Your draft is retained.";
      }
    } finally {
      s.saving = false;
      notify();

      if (mounted.current && !s.error && !s.hasConflict) {
        synchronize(props.current.entry);

        const blurQueued = s.queuedBlur;
        s.queuedBlur = false;

        if (
          s.value !== (s.base?.note ?? "") &&
          (cleanLogNote(s.value) || blurQueued)
        ) {
          timer.current = setTimeout(
            () => void saveRef.current(blurQueued),
            600,
          );
        }
      }
    }
  }

  saveRef.current = save;
  syncRef.current = synchronize;

  const incomingKey = entryKey(entry);

  // Only identities/revisions drive reconciliation; ordinary parent rerenders do not replace drafts.
  useEffect(() => {
    void incomingKey;
    syncRef.current(props.current.entry);
  }, [incomingKey]);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;

      if (timer.current) {
        clearTimeout(timer.current);
      }

      if (echoTimer.current) {
        clearTimeout(echoTimer.current);
      }

      props.current.onWork(false);
    };
  }, []);

  const s = state.current;

  return {
    get value() {
      return state.current.value;
    },

    get error() {
      return state.current.error;
    },

    get isSaving() {
      return state.current.saving;
    },

    get hasChanges() {
      return dirty();
    },

    get hasConflict() {
      return state.current.hasConflict;
    },

    get conflict() {
      return state.current.conflict;
    },

    changeValue(value: string) {
      cancel();
      s.value = value;

      if (!s.hasConflict) {
        s.error = undefined;
      }

      props.current.onWork(true);
      notify();

      if (!s.hasConflict && cleanLogNote(value)) {
        timer.current = setTimeout(() => void saveRef.current(false), 600);
      }
    },

    handleBlur: () => {
      if (!s.error && !s.hasConflict) {
        void saveRef.current(true);
      }
    },

    retry: () => void saveRef.current(true),

    discard: () => {
      cancel();
      adopt(s.hasConflict ? s.conflict : props.current.entry);
      notify();
    },

    replace: () => {
      if (s.saving) {
        return;
      }

      const current = s.conflict;
      s.base = current;
      s.newId = crypto.randomUUID();
      s.hasConflict = false;
      s.conflict = null;
      s.error = undefined;
      s.pending = undefined;
      notify();
      void saveRef.current(true);
    },
  };
}
