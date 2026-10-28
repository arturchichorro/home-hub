import { useSyncExternalStore } from "react";
import { hasUpdateBlockers } from "./activity";
import { createUpdateController } from "./controller";

export const updateActions = {
  check: async () => {},
  activate: async () => {},
};
export const appUpdates = createUpdateController({
  now: () => Date.now(),
  blocked: () =>
    hasUpdateBlockers() ||
    (typeof document !== "undefined" &&
      Boolean(
        document.querySelector(
          'form[data-update-dirty], [role="dialog"], button[aria-busy="true"]',
        ),
      )),
  focused: () =>
    typeof document !== "undefined" &&
    (!document.hasFocus() ||
      Boolean(
        document.activeElement?.matches(
          'input,textarea,select,[contenteditable="true"]',
        ),
      )),
  visible: () =>
    typeof document !== "undefined" && document.visibilityState === "visible",
  online: () => typeof navigator !== "undefined" && navigator.onLine,
  check: () => updateActions.check(),
  activate: () => updateActions.activate(),
  reload: () => window.location.reload(),
});
export const requireAppUpdate = () => appUpdates.require();
export function useUpdateRequired() {
  return useSyncExternalStore(
    appUpdates.subscribe,
    () => appUpdates.getState().required,
    () => false,
  );
}
