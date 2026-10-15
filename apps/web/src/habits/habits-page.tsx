import {
  adjacentHabitPeriod,
  calendarDate,
  type HabitView,
  habitPeriod,
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
import { HabitMonthCalendar } from "./habit-month-calendar";
import { HabitNameDialog } from "./habit-name-dialog";
import { HabitNameInput } from "./habit-name-input";
import { HabitWeekCalendar } from "./habit-week-calendar";

export function HabitsPage({ householdId }: { householdId: string }) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const [now, setNow] = useState(Date.now);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = calendarDate(now, timeZone);
  const [anchor, setAnchor] = useState<string>();
  const [view, setView] = useState<HabitView>("week");
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();
  const pendingRef = useRef(new Set<string>());
  const [pending, setPending] = useState(new Set<string>());
  const period = habitPeriod(anchor ?? today, view);
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

  const label =
    view === "month"
      ? new Intl.DateTimeFormat(undefined, {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${period.startOn}T12:00:00Z`))
      : `${period.startOn} – ${period.endOn}`;
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
        <fieldset className="flex gap-1" aria-label="Calendar view">
          <Button
            variant={view === "week" ? "secondary" : "ghost"}
            aria-pressed={view === "week"}
            onClick={() => setView("week")}
          >
            Week
          </Button>
          <Button
            variant={view === "month" ? "secondary" : "ghost"}
            aria-pressed={view === "month"}
            onClick={() => setView("month")}
          >
            Month
          </Button>
        </fieldset>
        <IconButton
          aria-label={`Previous ${view}`}
          onClick={() =>
            setAnchor(adjacentHabitPeriod(anchor ?? today, view, -1))
          }
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </IconButton>
        <span className="text-sm font-medium" aria-live="polite">
          {label}
        </span>
        <IconButton
          aria-label={`Next ${view}`}
          onClick={() =>
            setAnchor(adjacentHabitPeriod(anchor ?? today, view, 1))
          }
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
      {!enabled && !archived ? (
        <p className="text-sm text-muted">
          Read-only while synchronization is unavailable.
        </p>
      ) : null}
      <div
        className={`grid min-w-0 gap-6 ${view === "month" ? "grid-cols-[repeat(auto-fill,minmax(min(100%,24rem),24rem))] items-start" : ""}`}
        aria-busy={loading}
      >
        {habits.map((habit) => {
          const Calendar =
            view === "month" ? HabitMonthCalendar : HabitWeekCalendar;
          return (
            <section
              key={habit.id}
              className="grid w-full min-w-0 max-w-sm gap-3"
              aria-label={habit.name}
            >
              <div className="flex items-center gap-2">
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
              <Calendar
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
            </section>
          );
        })}
        {habits.length === 0 && result.type !== "error" ? (
          <p className="text-muted">
            {loading
              ? "Loading habits…"
              : archived
                ? "No archived habits."
                : "No habits yet. Add one to start tracking together."}
          </p>
        ) : null}
      </div>
      {creating ? (
        <HabitNameDialog
          householdId={householdId}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </div>
  );
}
