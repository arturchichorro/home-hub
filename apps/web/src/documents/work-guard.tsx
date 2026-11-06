import { Button, DialogPopup, DialogRoot } from "@home-hub/ui-web";
import { useBlocker } from "@tanstack/react-router";
import { useBlockAppUpdate } from "../updates/activity";

export function DocumentWorkGuard({
  dirty,
  busy,
  discard,
}: {
  dirty: boolean;
  busy: boolean;
  discard: () => void;
}) {
  useBlockAppUpdate(dirty || busy);

  const blocker = useBlocker({
    shouldBlockFn: () => dirty,

    enableBeforeUnload: () => dirty,

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
        title="Unsaved document work"
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
              disabled={busy}
              onClick={() => {
                discard();

                if (blocker.status === "blocked") {
                  blocker.proceed();
                }
              }}
            >
              Discard and leave
            </Button>
          </>
        }
      >
        An upload or tag change has not finished. Keep editing to retry, or
        discard pending work.
      </DialogPopup>
    </DialogRoot>
  );
}
