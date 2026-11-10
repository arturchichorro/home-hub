import {
  adjacentHabitMonth,
  clampHabitMonth,
  habitCompleted,
  habitMonth,
} from "@home-hub/shared/habits";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  IconButton,
  InlineAlert,
} from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { useEffect, useRef } from "react";
import {
  formatHabitDate,
  HabitDayPreview,
  HabitTodayToggle,
  monthCalendarWeeks,
  monthFormatter,
  weekdayLabels,
} from "./habit-days";
import { HabitEntryNote } from "./habit-entry-note";

export function HabitHistory({
  householdId,
  habitId,
  name,
  personId,
  own,
  archived,
  today,
  anchor,
  selectedDate,
  enabled,
  locked,
  pending,
  onMonth,
  onDate,
  onCompleted,
  onDirtyChange,
  onEntriesChanged,
}: {
  householdId: string;
  habitId: string;
  name: string;
  personId: string;
  own: boolean;
  archived: boolean;
  today: string;
  anchor: string;
  selectedDate?: string | undefined;
  enabled: boolean;
  locked: boolean;
  pending: ReadonlySet<string>;
  onMonth: (date: string) => void;
  onDate: (date: string) => void;
  onCompleted: (date: string, completed: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  onEntriesChanged?: () => void;
}) {
  const period = habitMonth(clampHabitMonth(anchor, today));
  const [rows, result] = useQuery(
    queries.habits.historyForPerson({
      householdId,
      habitId,
      personId,
      archived,
      startOn: period.startOn,
      endOn: period.endOn,
    }),
  );
  const entries = new Map(
    rows[0]?.entries
      .filter((e) => e.userId === personId)
      .map((e) => [e.entryOn, e]),
  );
  const entry = selectedDate ? entries.get(selectedDate) : undefined;
  const loading = result.type !== "complete";
  const fingerprint = JSON.stringify(
    rows[0]?.entries.map((e) => [e.entryOn, e.completed, e.workoutCompleted]),
  );
  const notified = useRef<string>(undefined);
  useEffect(() => {
    if (result.type === "complete" && notified.current !== fingerprint) {
      notified.current = fingerprint;
      onEntriesChanged?.();
    }
  }, [fingerprint, result.type, onEntriesChanged]);

  return (
    <section
      className="grid min-w-0 gap-3 py-2 sm:max-w-md"
      aria-label={`History for ${name}`}
      aria-busy={loading}
    >
      {result.type !== "error" && (
        <>
          {" "}
          {selectedDate && !loading && rows[0] ? (
            <section
              className="grid gap-2 border-t border-border pt-2"
              aria-label={`Details for ${name} on ${selectedDate}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">{formatHabitDate(selectedDate)}</span>
                {!own || archived || entry?.workoutCompleted ? (
                  <span className="text-xs text-muted">
                    {entry?.workoutCompleted
                      ? "From training"
                      : habitCompleted(entry)
                        ? "Completed"
                        : "Not recorded"}
                  </span>
                ) : (
                  <HabitTodayToggle
                    name={name}
                    date={selectedDate}
                    completed={habitCompleted(entry)}
                    pending={pending.has(`${habitId}:${selectedDate}`)}
                    disabled={
                      !own ||
                      !!entry?.workoutCompleted ||
                      archived ||
                      !enabled ||
                      selectedDate > today ||
                      pending.has(`${habitId}:${selectedDate}`)
                    }
                    onToggle={() =>
                      onCompleted(selectedDate, !habitCompleted(entry))
                    }
                  />
                )}
              </div>
              <HabitEntryNote
                key={`${personId}:${selectedDate}`}
                householdId={householdId}
                habitId={habitId}
                name={name}
                date={selectedDate}
                note={entry?.note ?? null}
                disabled={!enabled}
                readOnly={!own || archived || selectedDate > today}
                initiallyOpen
                hideTrigger
                onDirtyChange={onDirtyChange}
              />
            </section>
          ) : null}
        </>
      )}
      <div className="flex items-center gap-1">
        <IconButton
          aria-label="Previous month"
          disabled={locked}
          onClick={() => onMonth(adjacentHabitMonth(period.startOn, -1))}
        >
          <ChevronLeft className="size-4" />
        </IconButton>
        <span className="min-w-0 flex-1 text-sm font-medium" aria-live="polite">
          {monthFormatter.format(new Date(`${period.startOn}T12:00:00Z`))}
        </span>
        <IconButton
          aria-label="Next month"
          disabled={locked || period.startOn >= `${today.slice(0, 7)}-01`}
          onClick={() => onMonth(adjacentHabitMonth(period.startOn, 1))}
        >
          <ChevronRight className="size-4" />
        </IconButton>
        <IconButton
          aria-label="Today"
          title="Today"
          disabled={locked}
          onClick={() => onMonth(today)}
        >
          <Calendar className="size-4" />
        </IconButton>
      </div>
      {result.type === "error" ? (
        <InlineAlert role="alert" variant="danger">
          Unable to load history.
        </InlineAlert>
      ) : (
        <table
          className="w-full table-fixed text-center"
          aria-label={`${name} history`}
        >
          <thead>
            <tr>
              {weekdayLabels.map((label) => (
                <th key={label} className="py-1 text-xs font-normal text-muted">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthCalendarWeeks(period.dates).map((week) => (
              <tr key={week.join(",")}>
                {week.map((date, j) => (
                  <td key={date ?? j} className="p-0">
                    {date ? (
                      <HabitDayPreview
                        calendar
                        name={name}
                        date={date}
                        today={today}
                        entry={entries.get(date)}
                        selected={date === selectedDate}
                        disabled={locked || loading || date > today}
                        onInspect={() => onDate(date)}
                      />
                    ) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
