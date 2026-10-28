import { useEffect, useRef } from "react";

// Keep identity-changing controls locked until a draft has really saved. A failed
// save leaves the editor mounted and retryable; Escape explicitly reverts it.
export function useHabitDraftStatus(
  dirty: boolean,
  onChange?: (dirty: boolean) => void,
) {
  const notify = useRef(onChange);
  notify.current = onChange;
  useEffect(() => {
    notify.current?.(dirty);
  }, [dirty]);
  useEffect(() => () => notify.current?.(false), []);
}
