import { useEffect } from "react";

const blockers = new Set<symbol>();
export function hasUpdateBlockers() {
  return blockers.size > 0;
}

// Also usable around an async operation that outlives its component (uploads).
export function blockAppUpdate() {
  const token = Symbol();
  blockers.add(token);
  return () => {
    blockers.delete(token);
  };
}

export function useBlockAppUpdate(blocked: boolean) {
  useEffect(() => (blocked ? blockAppUpdate() : undefined), [blocked]);
}
