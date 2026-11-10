import {
  type HabitStats,
  habitStatsSchema,
} from "@home-hub/shared/habit-stats";
import { useEffect, useRef, useState } from "react";
import { useMediaSession } from "../media/session";

export function useHabitStats(
  householdId: string,
  habitId: string,
  personId: string,
  revision: number,
  today: string,
  enabled: boolean,
) {
  const session = useMediaSession();
  const expired = useRef(session?.onSessionExpired);
  expired.current = session?.onSessionExpired;
  const [result, setResult] = useState<{
    key: string;
    data?: HabitStats;
    error?: string;
  }>({ key: "" });
  const key = JSON.stringify([
    session?.userId,
    session?.accessToken,
    householdId,
    habitId,
    personId,
    today,
    revision,
  ]);
  const token = session?.accessToken;

  useEffect(() => {
    if (!token || !enabled) {
      return;
    }
    let disposed = false;
    let request: AbortController | undefined;
    let loading = false;
    const load = async () => {
      if (loading) {
        return;
      }
      loading = true;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      setResult({ key });
      try {
        const response = await fetch(
          `/api/households/${encodeURIComponent(householdId)}/habits/${encodeURIComponent(habitId)}/stats?${new URLSearchParams({ personId, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(30000),
            ]),
          },
        );
        if (disposed || controller.signal.aborted) {
          return;
        }
        if (response.status === 401) {
          expired.current?.();
        }
        if (!response.ok) {
          throw Error("stats");
        }
        const data = habitStatsSchema.parse(await response.json());
        if (!disposed && !controller.signal.aborted) {
          setResult({ key, data });
        }
      } catch {
        if (!disposed && !controller.signal.aborted) {
          setResult({ key, error: "Unable to load statistics." });
        }
      } finally {
        loading = false;
      }
    };
    const focus = () => {
      void load();
    };
    const visible = () => {
      if (document.visibilityState === "visible") {
        void load();
      }
    };
    void load();
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visible);
    return () => {
      disposed = true;
      request?.abort();
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [key, token, householdId, habitId, personId, enabled]);

  const visible = result.key === key ? result : undefined;

  return { data: visible?.data, error: visible?.error };
}
