import {
  adjacentHabitMonth,
  calendarDate,
  clampHabitMonth,
  habitMonth,
} from "@home-hub/shared/habits";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Archive,
  Button,
  ChevronLeft,
  ChevronRight,
  ConfirmationPopover,
  IconButton,
  InlineAlert,
  Plus,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useEffect, useRef, useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { HabitGrid } from "./habit-grid";
import { HabitMonthCalendar } from "./habit-month-calendar";
import { HabitNameDialog } from "./habit-name-dialog";
import { HabitNameInput } from "./habit-name-input";

export function HabitsPage({ householdId }: { householdId: string }) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const [now, setNow] = useState(Date.now);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = calendarDate(now, timeZone);
  const [anchor, setAnchor] = useState<string>();
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();
  const pendingRef = useRef(new Set<string>());
  const [pending, setPending] = useState(new Set<string>());
  const period = habitMonth(clampHabitMonth(anchor ?? today, today));
  const canGoNext = period.startOn < `${today.slice(0, 7)}-01`;
  const [habits, result] = useQuery(
    queries.habits.byHousehold({
      householdId,
      startOn: period.startOn,
      endOn: period.endOn,
      archived,
    }),
  );
  const [members, memberResult] = useQuery(
    queries.householdMemberships.byHousehold({ householdId }),
  );

  useEffect(() => {
    const update = () => setNow(Date.now());
    const interval = setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", update);
    };
  }, []);

  async function change(
    key: string,
    request: Parameters<typeof zero.mutate>[0],
  ) {
    if (!enabled || pendingRef.current.has(key)) return;
    pendingRef.current.add(key);
    setPending(new Set(pendingRef.current));
    setError(undefined);
    try {
      const mutation = zero.mutate(request);
      const client = await mutation.client;
      const outcome = client.type === "error" ? client : await mutation.server;
      if (outcome.type === "error")
        setError("The change could not be saved. Please try again.");
    } catch {
      setError("The change could not be saved. Please try again.");
    } finally {
      pendingRef.current.delete(key);
      setPending(new Set(pendingRef.current));
    }
  }

  const label = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${period.startOn}T12:00:00Z`));
  const loading =
    result.type !== "complete" || memberResult.type !== "complete";
  return (
    <div className="grid min-w-0 gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">
          {archived ? "Archived habits" : "Habits"}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setArchived(!archived)}>
            {archived ? "Active habits" : "Archive"}
          </Button>
          {!archived ? (
            <Button disabled={!enabled} onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" className="size-4" />
              Add habit
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          aria-label="Previous month"
          onClick={() => setAnchor(adjacentHabitMonth(period.startOn, -1))}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </IconButton>
        <span className="text-sm font-medium" aria-live="polite">
          {label}
        </span>
        <IconButton
          aria-label="Next month"
          disabled={!canGoNext}
          onClick={() => {
            if (canGoNext)
              setAnchor(
                clampHabitMonth(adjacentHabitMonth(period.startOn, 1), today),
              );
          }}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </IconButton>
        <Button variant="ghost" onClick={() => setAnchor(undefined)}>
          Today
        </Button>
      </div>
      {error ? (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      ) : null}
      {result.type === "error" || memberResult.type === "error" ? (
        <InlineAlert role="alert" variant="danger">
          Unable to load habits and household members.
        </InlineAlert>
      ) : null}
      <HabitGrid
        habits={habits}
        disabled={!enabled || archived || pending.size > 0}
        archived={archived}
        loading={loading}
        onMove={(habitId, orderedHabitIds) =>
          void change(
            "habit-order",
            mutators.habits.reorder({
              householdId,
              habitId,
              orderedHabitIds,
              optimisticTimestamp: Date.now(),
            }),
          )
        }
      >
        {(habit, handle) => (
          <>
            <div className="flex items-center gap-2">
              {handle}
              {archived ? (
                <h2 className="min-w-0 flex-1 break-words text-lg font-medium text-primary">
                  {habit.name}
                </h2>
              ) : (
                <HabitNameInput
                  currentName={habit.name}
                  householdId={householdId}
                  habitId={habit.id}
                  disabled={pending.has(habit.id)}
                />
              )}
              {!archived ? (
                <ConfirmationPopover
                  message={`Archive “${habit.name}” for everyone? Its history will be kept, but tracking will stop.`}
                  trigger={
                    <IconButton
                      aria-label={`Archive ${habit.name}`}
                      disabled={!enabled || pending.has(habit.id)}
                    >
                      <Archive aria-hidden="true" className="size-4" />
                    </IconButton>
                  }
                  onConfirm={() =>
                    void change(
                      habit.id,
                      mutators.habits.archive({
                        householdId,
                        habitId: habit.id,
                        optimisticTimestamp: Date.now(),
                      }),
                    )
                  }
                />
              ) : null}
            </div>
            <HabitMonthCalendar
              habit={habit}
              members={members}
              currentUserId={zero.userID}
              dates={period.dates}
              today={today}
              label={label}
              archived={archived}
              enabled={enabled}
              pending={pending}
              onSetCompleted={(date, completed) =>
                void change(
                  `${habit.id}:${date}`,
                  mutators.habits.setCompleted({
                    householdId,
                    habitId: habit.id,
                    completedOn: date,
                    completed,
                    timeZone,
                    optimisticTimestamp: Date.now(),
                  }),
                )
              }
            />
          </>
        )}
      </HabitGrid>
      {habits.length === 0 && result.type !== "error" ? (
        <p className="text-muted">
          {loading
            ? "Loading habits…"
            : archived
              ? "No archived habits."
              : "No habits yet. Add one to start tracking together."}
        </p>
      ) : null}
      {creating ? (
        <HabitNameDialog
          householdId={householdId}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </div>
  );
}
