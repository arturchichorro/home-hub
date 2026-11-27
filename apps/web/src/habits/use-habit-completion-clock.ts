import { useEffect, useState } from "react";

// Local deadline notification, not data polling. Eligibility is already replicated.
export function useHabitCompletionClock(
  entries: readonly { calendarEligibleAt?: number | null }[],
) {
  const [now, setNow] = useState(Date.now);
  const next = entries.reduce((deadline, entry) => {
    const at = entry.calendarEligibleAt;
    return at != null && at > now ? Math.min(deadline, at) : deadline;
  }, Number.POSITIVE_INFINITY);

  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = Number.isFinite(next)
      ? setTimeout(
          update,
          Math.min(
            2_147_000_000,
            Math.max(0, next - Math.max(now, Date.now())),
          ),
        )
      : undefined;
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [next, now]);

  return now;
}
