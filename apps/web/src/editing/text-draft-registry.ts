export type TextDraft = {
  hasChanges: boolean;
  isSaving: boolean;
  error: string | undefined;
  retry: () => void;
  discard: () => void;
};

// One navigation blocker per authenticated session, not per historical note.
export function createTextDraftRegistry() {
  const drafts = new Map<symbol, () => TextDraft>();
  const listeners = new Set<() => void>();
  let snapshot = { hasChanges: false, isSaving: false };

  function refresh() {
    const values = Array.from(drafts.values(), (read) => read());
    const hasChanges = values.some((d) => d.hasChanges || d.isSaving);
    const isSaving = values.some((d) => d.isSaving);

    if (snapshot.hasChanges === hasChanges && snapshot.isSaving === isSaving) {
      return;
    }

    snapshot = { hasChanges, isSaving };

    for (const listener of listeners) {
      listener();
    }
  }

  return {
    refresh,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    register(read: () => TextDraft) {
      const id = Symbol();
      drafts.set(id, read);
      refresh();

      return () => {
        drafts.delete(id);
        refresh();
      };
    },
    discard() {
      if (snapshot.isSaving) {
        return;
      }

      for (const read of drafts.values()) {
        if (read().hasChanges) {
          read().discard();
        }
      }
    },
  };
}
