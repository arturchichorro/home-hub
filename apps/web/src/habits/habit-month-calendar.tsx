import {
  type HabitCalendarProps,
  HabitCompletionTotals,
  HabitDay,
} from "./habit-calendar-shared";
import { habitMemberColors } from "./habit-member-mark";

const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

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
  return Array.from({ length: cells.length / 7 }, (_, index) =>
    cells.slice(index * 7, index * 7 + 7),
  );
}

export function HabitMonthCalendar(props: HabitCalendarProps) {
  const { habit, members, dates, label } = props;
  const weeks = monthCalendarWeeks(dates);
  const colors = habitMemberColors(members.map((member) => member.userId));
  return (
    <div className="grid w-full min-w-0 max-w-sm gap-2">
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full table-fixed border-collapse text-sm">
          <caption className="sr-only">
            {habit.name}, {label}. Shared monthly calendar. Select a day to
            toggle only your completion.
          </caption>
          <thead>
            <tr>
              {weekdays.map((weekday, day) => (
                <th
                  key={weekday}
                  scope="col"
                  className="border-b border-border py-1.5 text-center text-xs font-medium text-muted"
                >
                  {new Intl.DateTimeFormat(undefined, {
                    weekday: "short",
                    timeZone: "UTC",
                  }).format(new Date(Date.UTC(2026, 0, 5 + day)))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week.join(",")}>
                {week.map((date, dayIndex) =>
                  date === null ? (
                    <td
                      key={weekdays[dayIndex]}
                      aria-hidden="true"
                      className="border border-border bg-surface"
                    />
                  ) : (
                    <td
                      key={date}
                      className="h-14 border border-border p-0 align-top"
                    >
                      <HabitDay {...props} date={date} colors={colors} />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <HabitCompletionTotals {...props} colors={colors} period="Monthly" />
    </div>
  );
}
