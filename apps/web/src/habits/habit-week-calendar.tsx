import {
  type HabitCalendarProps,
  HabitCompletionTotals,
  HabitDay,
} from "./habit-calendar-shared";
import { habitMemberColors } from "./habit-member-mark";

export function HabitWeekCalendar(props: HabitCalendarProps) {
  const colors = habitMemberColors(
    props.members.map((member) => member.userId),
  );
  return (
    <div className="grid w-full min-w-0 max-w-sm gap-2">
      <p className="sr-only">
        {props.habit.name}, {props.label}. Shared weekly calendar. Select a day
        to toggle only your completion.
      </p>
      <div className="grid grid-cols-7 gap-1">
        {props.dates.map((date) => (
          <div key={date} className="grid gap-1">
            <span className="text-center text-xs text-muted">
              {new Intl.DateTimeFormat(undefined, {
                weekday: "short",
                timeZone: "UTC",
              }).format(new Date(`${date}T12:00:00Z`))}
            </span>
            <div className="grid min-h-14 rounded-sm border border-border">
              <HabitDay {...props} date={date} colors={colors} />
            </div>
          </div>
        ))}
      </div>
      <HabitCompletionTotals {...props} colors={colors} period="Weekly" />
    </div>
  );
}
