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
import { HabitNameDialog } from "./habit-name-dialog";

export function HabitsPage({ householdId }: { householdId: string }) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const [now, setNow] = useState(Date.now);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = calendarDate(now, timeZone);
  const [anchor, setAnchor] = useState<string>();
  const [view, setView] = useState<HabitView>("week");
  const [archived, setArchived] = useState(false);
  const [dialog, setDialog] = useState<{ id: string; name: string } | "new">();
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
            <Button disabled={!enabled} onClick={() => setDialog("new")}>
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
      <div className="grid min-w-0 gap-6" aria-busy={loading}>
        {habits.map((habit) => {
          const visibleMembers = members.filter(
            (member) =>
              member.userId === zero.userID ||
              habit.completions.some(
                (completion) => completion.userId === member.userId,
              ),
          );
          visibleMembers.sort(
            (a, b) =>
              Number(b.userId === zero.userID) -
              Number(a.userId === zero.userID),
          );
          return (
            <section
              key={habit.id}
              className="grid min-w-0 gap-3"
              aria-label={habit.name}
            >
              <div className="flex items-center gap-2">
                <h2 className="min-w-0 flex-1 break-words text-lg font-medium text-primary">
                  {habit.name}
                </h2>
                {!archived ? (
                  <>
                    <Button
                      variant="ghost"
                      size="compact"
                      disabled={!enabled || pending.has(habit.id)}
                      onClick={() =>
                        setDialog({ id: habit.id, name: habit.name })
                      }
                    >
                      Rename
                    </Button>
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
                  </>
                ) : null}
              </div>
              <div className="min-w-0 overflow-x-auto rounded-md border border-border">
                <table className="w-max min-w-full border-collapse text-sm">
                  <caption className="sr-only">
                    {habit.name}, {label}. Completion counts are for this
                    displayed {view}.
                  </caption>
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="sticky left-0 z-10 min-w-36 bg-canvas px-3 py-2 text-left font-medium"
                      >
                        Person / count
                      </th>
                      {period.dates.map((date) => (
                        <th
                          key={date}
                          scope="col"
                          aria-label={date}
                          className="px-1 py-2 text-center font-normal text-muted"
                        >
                          <span className="block text-xs">
                            {new Intl.DateTimeFormat(undefined, {
                              weekday: "short",
                              timeZone: "UTC",
                            }).format(new Date(`${date}T12:00:00Z`))}
                          </span>
                          <span>{Number(date.slice(8))}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleMembers.map((member) => {
                      const own = member.userId === zero.userID;
                      const name = member.user?.username ?? "Member";
                      const completed = new Set(
                        habit.completions
                          .filter(
                            (completion) => completion.userId === member.userId,
                          )
                          .map((completion) => completion.completedOn),
                      );
                      return (
                        <tr key={member.id} className="border-t border-border">
                          <th
                            scope="row"
                            className="sticky left-0 z-10 bg-canvas px-3 py-2 text-left font-normal"
                          >
                            <span className="block max-w-36 truncate">
                              {name}
                              {own ? " (you)" : ""}
                            </span>
                            <span className="text-xs text-muted">
                              {completed.size}{" "}
                              {completed.size === 1 ? "day" : "days"}
                            </span>
                          </th>
                          {period.dates.map((date) => {
                            const checked = completed.has(date);
                            const key = `${habit.id}:${date}`;
                            const available =
                              date >= habit.createdOn && date <= today;
                            const description = `${habit.name}, ${name}, ${date}`;
                            return (
                              <td
                                key={date}
                                className={`px-1 py-2 text-center ${date === today ? "bg-raised" : ""}`}
                              >
                                {own && !archived ? (
                                  <Button
                                    className="size-11! rounded-sm! p-0!"
                                    variant={checked ? "primary" : "secondary"}
                                    aria-label={description}
                                    aria-pressed={checked}
                                    disabled={
                                      !enabled ||
                                      !available ||
                                      pending.has(key) ||
                                      pending.has(habit.id)
                                    }
                                    onClick={() =>
                                      void change(
                                        key,
                                        mutators.habits.setCompleted({
                                          householdId,
                                          habitId: habit.id,
                                          completedOn: date,
                                          completed: !checked,
                                          timeZone,
                                          optimisticTimestamp: Date.now(),
                                        }),
                                      )
                                    }
                                  >
                                    {checked ? (
                                      "X"
                                    ) : (
                                      <span aria-hidden="true">·</span>
                                    )}
                                  </Button>
                                ) : (
                                  <span
                                    role="img"
                                    aria-label={`${description}: ${checked ? "completed" : "not completed"}`}
                                    className={`inline-flex size-11 items-center justify-center rounded-sm ${checked ? "bg-primary text-on-primary" : "bg-surface text-subtle"}`}
                                  >
                                    {checked ? "X" : "·"}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
      {dialog === "new" ? (
        <HabitNameDialog
          householdId={householdId}
          onClose={() => setDialog(undefined)}
        />
      ) : dialog ? (
        <HabitNameDialog
          householdId={householdId}
          habit={dialog}
          onClose={() => setDialog(undefined)}
        />
      ) : null}
    </div>
  );
}
