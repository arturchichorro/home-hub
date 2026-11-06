import { Button, DialogPopup, DialogRoot } from "@home-hub/ui-web";
import { useBlocker } from "@tanstack/react-router";

type Draft = {
  hasChanges: boolean;
  isSaving: boolean;
  error: string | undefined;
  retry: () => void;
  discard: () => void;
};

// Only mounted while a retained draft exists, not once per historical note.
export function TextDraftGuard({ editor }: { editor: Draft }) {
  const blocker = useBlocker({
    shouldBlockFn: () => editor.hasChanges,

    enableBeforeUnload: () => editor.hasChanges,

    withResolver: true,
  });

  return (
    <DialogRoot
      open={blocker.status === "blocked"}
      onOpenChange={(open) => {
        if (!open && blocker.status === "blocked") {
          blocker.reset();
        }
      }}
    >
      <DialogPopup
        title="Unsaved text"
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
              disabled={editor.isSaving}
              onClick={() => {
                editor.discard();

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
        Your text has not been saved. Keep editing to retry, or discard the
        draft.
      </DialogPopup>
    </DialogRoot>
  );
}

export function TextDraftActions({ editor }: { editor: Draft }) {
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
