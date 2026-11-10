import { habitCompleted, shiftCalendarDate } from "@home-hub/shared/habits";
import { formatHabitDate, type HabitEntry } from "./habit-days";

const weekday = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  timeZone: "UTC",
});
export function HabitPreview({
  name,
  today,
  entries,
}: {
  name: string;
  today: string;
  entries: readonly HabitEntry[];
}) {
  const byDate = new Map(entries.map((entry) => [entry.entryOn, entry]));
  return (
    <ol
      aria-label={`Last seven days for ${name}`}
      className="grid w-full max-w-56 grid-cols-7 gap-2"
    >
      {Array.from({ length: 7 }, (_, index) =>
        shiftCalendarDate(today, index - 6),
      ).map((date) => {
        const entry = byDate.get(date);
        const completed = habitCompleted(entry);
        return (
          <li
            key={date}
            className="grid min-w-0 gap-1 text-center"
            title={`${formatHabitDate(date)} · ${completed ? "Completed" : "Not recorded"}${entry?.note ? " · Has note" : ""}`}
          >
            <span
              className={
                date === today
                  ? "text-xs text-foreground"
                  : "text-xs text-muted"
              }
              aria-hidden="true"
            >
              {date === today
                ? "Today"
                : weekday.format(new Date(`${date}T12:00:00Z`))}
            </span>
            <span
              role="img"
              aria-label={`${date}: ${completed ? "Completed" : "Not recorded"}${entry?.note ? ", has note" : ""}`}
              aria-current={date === today ? "date" : undefined}
              className={`relative h-1.5 rounded-full ${completed ? "bg-foreground" : "bg-border"}`}
            >
              {entry?.note && (
                <span
                  aria-hidden="true"
                  className="absolute -bottom-1.5 left-1/2 size-0.5 rounded-full bg-muted"
                />
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
