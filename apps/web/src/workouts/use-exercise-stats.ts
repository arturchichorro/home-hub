import {
  type ExerciseStats,
  exerciseStatsSchema,
} from "@home-hub/shared/exercise-stats";
import { useEffect, useRef, useState } from "react";
import { useMediaSession } from "../media/session";

export function useExerciseStats(
  householdId: string,
  exerciseId: string,
  revision: number,
) {
  const session = useMediaSession();
  const expired = useRef(session?.onSessionExpired);
  expired.current = session?.onSessionExpired;
  const [result, setResult] = useState<{
    key: string;
    data?: ExerciseStats;
    error?: string;
  }>({ key: "" });
  const key = JSON.stringify([
    session?.userId,
    session?.accessToken,
    householdId,
    exerciseId,
    revision,
  ]);
  const token = session?.accessToken;

  useEffect(() => {
    if (!token) {
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
          `/api/households/${encodeURIComponent(householdId)}/workouts/exercises/${encodeURIComponent(exerciseId)}/stats`,
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
        const data = exerciseStatsSchema.parse(await response.json());
        if (!disposed && !controller.signal.aborted) {
          setResult({ key, data });
        }
      } catch {
        if (!disposed && !controller.signal.aborted) {
          setResult({ key, error: "Unable to load exercise statistics." });
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
  }, [key, token, householdId, exerciseId]);

  const visible = result.key === key ? result : undefined;

  return { data: visible?.data, error: visible?.error };
}
