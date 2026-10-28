import { Button, ConfirmationPopover } from "@home-hub/ui-web";
import { useSyncExternalStore } from "react";
import { appUpdates } from "./state";

export function AppUpdates() {
  const state = useSyncExternalStore(
    appUpdates.subscribe,
    appUpdates.getState,
    appUpdates.getState,
  );
  if (!state.waiting && !state.ready && !state.required) return null;
  const canUpdate = state.waiting || state.ready || state.reloadOnly;
  const label = state.applying
    ? "Updating…"
    : canUpdate
      ? "Update"
      : "Check again";
  const trigger = (
    <Button size="compact" disabled={state.applying}>
      {label}
    </Button>
  );
  return (
    <aside
      role={state.required ? "alert" : "status"}
      className="fixed inset-x-3 bottom-3 z-60 mx-auto flex max-w-lg items-center justify-between gap-3 rounded-md border border-border bg-raised p-3 text-sm text-foreground shadow-lg"
    >
      <div>
        <p>
          {state.required
            ? "Update required to keep Home Hub in sync."
            : "A Home Hub update is ready."}
        </p>
        {state.error && <p className="text-xs text-danger">{state.error}</p>}
      </div>
      {canUpdate && state.blocked ? (
        <ConfirmationPopover
          message="Update and reload? Unsaved changes will be lost."
          confirmLabel="Update"
          trigger={trigger}
          onConfirm={() => void appUpdates.update(true)}
        />
      ) : (
        <Button
          size="compact"
          disabled={state.applying}
          onClick={() => void appUpdates.update()}
        >
          {label}
        </Button>
      )}
    </aside>
  );
}
