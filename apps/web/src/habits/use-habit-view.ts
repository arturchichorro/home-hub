import { calendarDate } from "@home-hub/shared/habits";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBlockAppUpdate } from "../updates/activity";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";

const localToday = () =>
  calendarDate(Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone);

export function useHabitView(
  householdId: string,
  currentUserId: string,
  requestedPerson?: string,
) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const [today, setToday] = useState(localToday);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const pendingRef = useRef(new Set<string>());
  const locked = dirty.size > 0 || pending.size > 0;
  const [members, memberResult] = useQuery(
    queries.householdMemberships.byHousehold({ householdId }),
  );
  const personId =
    requestedPerson &&
    members.some((member) => member.userId === requestedPerson)
      ? requestedPerson
      : currentUserId;
  const own = personId === currentUserId;
  useBlockAppUpdate(pending.size > 0);

  const dirtyChanged = useCallback(
    (key: string, value: boolean) =>
      setDirty((previous) => {
        if (previous.has(key) === value) {
          return previous;
        }

        const next = new Set(previous);
        if (value) {
          next.add(key);
        } else {
          next.delete(key);
        }

        return next;
      }),
    [],
  );

  useEffect(() => {
    const update = () => {
      if (!locked) {
        setToday(localToday());
      }
    };
    update();

    const timer = setInterval(update, 60000);
    window.addEventListener("focus", update);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [locked]);

  async function change(
    key: string,
    request: Parameters<typeof zero.mutate>[0],
  ) {
    if (!enabled || pendingRef.current.has(key)) {
      return false;
    }

    pendingRef.current.add(key);
    setPending(new Set(pendingRef.current));
    setError("");

    try {
      const outcome = await acknowledgeMutation(zero.mutate(request));
      if (outcome.type !== "success") {
        setError("Unable to save.");

        return false;
      }

      return true;
    } catch {
      setError("Unable to save.");

      return false;
    } finally {
      pendingRef.current.delete(key);
      setPending(new Set(pendingRef.current));
    }
  }

  function completed(
    habitId: string,
    date: string,
    value: boolean,
    archived = false,
  ) {
    if (!own || archived || date > today || memberResult.type !== "complete") {
      return;
    }

    void change(
      `${habitId}:${date}`,
      mutators.habits.setCompleted({
        householdId,
        habitId,
        entryOn: date,
        completed: value,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        optimisticTimestamp: Date.now(),
      }),
    );
  }

  return {
    today,
    personId,
    own,
    members,
    memberResult,
    enabled,
    locked,
    dirtyChanged,
    pending,
    error,
    change,
    completed,
  };
}

export type HabitView = ReturnType<typeof useHabitView>;
