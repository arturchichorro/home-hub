import { Button, DialogPopup, DialogRoot } from "@home-hub/ui-web";
import { useBlocker } from "@tanstack/react-router";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createTextDraftRegistry, type TextDraft } from "./text-draft-registry";

const DraftRegistry = createContext<ReturnType<
  typeof createTextDraftRegistry
> | null>(null);

// Keep the router blocker alive when a successful save unmounts a field guard.
export function TextDraftNavigation({ children }: { children: ReactNode }) {
  const [registry] = useState(createTextDraftRegistry);
  const state = useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
    registry.getSnapshot,
  );
  const blocker = useBlocker({
    shouldBlockFn: () => registry.getSnapshot().hasChanges,

    enableBeforeUnload: () => registry.getSnapshot().hasChanges,

    withResolver: true,
  });

  useEffect(() => {
    if (blocker.status === "blocked" && !state.hasChanges) {
      blocker.proceed();
    }
  }, [blocker, state.hasChanges]);

  return (
    <DraftRegistry.Provider value={registry}>
      {children}
      <DialogRoot
        open={blocker.status === "blocked" && state.hasChanges}
        onOpenChange={(open) => {
          if (!open && blocker.status === "blocked") {
            blocker.reset();
          }
        }}
      >
        <DialogPopup
          title={state.isSaving ? "Saving changes" : "Unsaved text"}
          actions={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  if (blocker.status === "blocked") {
                    blocker.reset();
                  }
                }}
              >
                Keep editing
              </Button>
              <Button
                disabled={state.isSaving}
                onClick={() => {
                  registry.discard();

                  if (blocker.status === "blocked") {
                    blocker.proceed();
                  }
                }}
              >
                Discard unsaved text
              </Button>
            </>
          }
        >
          {state.isSaving
            ? "Your changes are being saved. Navigation will continue when saving finishes."
            : "Your text has not been saved. Keep editing to retry, or discard the draft."}
        </DialogPopup>
      </DialogRoot>
    </DraftRegistry.Provider>
  );
}

// Only mounted while a retained draft exists, not once per historical note.
export function TextDraftGuard({ editor }: { editor: TextDraft }) {
  const registry = useContext(DraftRegistry);
  const current = useRef(editor);
  current.current = editor;

  useLayoutEffect(() => registry?.register(() => current.current), [registry]);
  useLayoutEffect(() => {
    registry?.refresh();
  });

  return null;
}

export function TextDraftActions({ editor }: { editor: TextDraft }) {
  return editor.error && editor.hasChanges ? (
    <span className="flex gap-2">
      <Button
        size="compact"
        variant="ghost"
        disabled={editor.isSaving}
        onPointerDown={(event) => event.preventDefault()}
        onClick={editor.retry}
      >
        Retry
      </Button>
      <Button
        size="compact"
        variant="ghost"
        disabled={editor.isSaving}
        onPointerDown={(event) => event.preventDefault()}
        onClick={editor.discard}
      >
        Discard
      </Button>
    </span>
  ) : null;
}
