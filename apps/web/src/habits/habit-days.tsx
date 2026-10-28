import { Button, Tooltip } from "@home-hub/ui-web";

export type HabitEntry = {
  userId: string;
  entryOn: string;
  completed: boolean | null;
  note?: string | null;
};
export type HabitRow = {
  id: string;
  name: string;
  note?: string | null;
  entries: readonly HabitEntry[];
};
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
export const monthFormatter = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
export const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 0, 5 + i))),
);
export const formatHabitDate = (date: string) =>
  dateFormatter.format(new Date(`${date}T12:00:00Z`));
export function monthCalendarWeeks(
  dates: readonly string[],
): (string | null)[][] {
  const first = dates[0];
  if (!first) return [];
  const offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array<null>(offset).fill(null),
    ...dates,
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );
}
export function HabitDayPreview({
  name,
  date,
  entry,
  today,
  selected,
  disabled,
  onInspect,
  calendar = false,
}: {
  name: string;
  date: string;
  entry?: HabitEntry | undefined;
  today: string;
  selected?: boolean;
  disabled?: boolean;
  onInspect: () => void;
  calendar?: boolean;
}) {
  const label = `${name}, ${date}. ${entry?.completed ? "Completed" : "Not recorded"}${entry?.note ? `. Note: ${entry.note}` : ""}`;
  const trigger = (
    <Button
      variant="ghost"
      title={entry?.note ? undefined : label}
      aria-label={label}
      aria-expanded={!!selected}
      disabled={disabled}
      className={`${calendar ? "h-11! w-full!" : "size-11! shrink-0"} relative flex-col! gap-0! p-0! [&>span]:flex-col [&>span]:gap-0.5 ${selected ? "bg-raised!" : ""}`}
      onClick={onInspect}
    >
      <span
        aria-current={date === today ? "date" : undefined}
        className={`text-xs ${date === today ? "font-bold" : "text-muted"}`}
      >
        {calendar
          ? Number(date.slice(8))
          : new Date(`${date}T12:00:00Z`).getUTCDate()}
      </span>
      <span
        aria-hidden="true"
        className={`size-2 rounded-sm ${entry?.completed ? "bg-foreground" : "bg-border"}`}
      />
      {entry?.note ? (
        <span
          aria-hidden="true"
          className="absolute bottom-0.5 size-1 rounded-full bg-foreground"
        />
      ) : null}
    </Button>
  );
  return entry?.note ? (
    <Tooltip
      delay={200}
      trigger={trigger}
      content={
        <div className="max-w-64 whitespace-pre-wrap break-words">
          <p>
            {formatHabitDate(date)} ·{" "}
            {entry.completed ? "Completed" : "Not recorded"}
          </p>
          <p>{entry.note}</p>
        </div>
      }
    />
  ) : (
    trigger
  );
}
export function HabitTodayToggle({
  name,
  date,
  completed,
  disabled,
  onToggle,
}: {
  name: string;
  date: string;
  completed: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      variant="ghost"
      className="size-11! shrink-0 p-0!"
      aria-label={`${name}, ${date}. ${completed ? "Clear completion" : "Mark done"}`}
      aria-pressed={completed}
      disabled={disabled}
      onClick={onToggle}
    >
      <span
        aria-hidden="true"
        className={`size-5 rounded-sm border border-border ${completed ? "bg-foreground" : ""}`}
      />
    </Button>
  );
}
