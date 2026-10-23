import { queries } from "@home-hub/shared/zero/queries";
import { InlineAlert } from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { type HabitCalendarProps, HabitDay } from "./habit-calendar-shared";
import { habitMemberColors } from "./habit-member-mark";
import { HabitNoteInput } from "./habit-note-input";

type Props = Pick<
  HabitCalendarProps,
  "members" | "currentUserId" | "today" | "enabled" | "pending"
> & {
  householdId: string;
  onSetCompleted: (habitId: string, completed: boolean) => void;
};

export function HabitDailyInput({
  householdId,
  members,
  currentUserId,
  today,
  enabled,
  pending,
  onSetCompleted,
}: Props) {
  // Independent of the month being browsed; the named query uses the same
  // household-wide habit ordering as the calendars below.
  const [habits, result] = useQuery(
    queries.habits.byHousehold({
      householdId,
      startOn: today,
      endOn: today,
      archived: false,
    }),
  );
  const colors = habitMemberColors(members.map((member) => member.userId));
  if (result.type === "error")
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to load habits.
      </InlineAlert>
    );
  if (!habits.length) return null;
  return (
    <ul
      aria-label="Today's habits"
      aria-busy={result.type !== "complete"}
      className="flex min-w-0 gap-4 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {habits.map((habit) => (
        <li
          key={habit.id}
          className="grid w-24 shrink-0 justify-items-center gap-2"
        >
          <span
            title={habit.name}
            className="w-full truncate text-center text-sm text-muted"
          >
            {habit.name}
          </span>
          <div className="size-14 overflow-hidden rounded-sm border border-border">
            <HabitDay
              habit={habit}
              members={members}
              currentUserId={currentUserId}
              date={today}
              today={today}
              archived={false}
              enabled={enabled}
              pending={pending}
              colors={colors}
              onSetCompleted={(_date, completed) =>
                onSetCompleted(habit.id, completed)
              }
            />
          </div>
          <HabitNoteInput
            key={`${currentUserId}:${today}`}
            householdId={householdId}
            habitId={habit.id}
            habitName={habit.name}
            entryOn={today}
            currentNote={
              habit.entries.find(
                (entry) =>
                  entry.userId === currentUserId && entry.entryOn === today,
              )?.note ?? null
            }
            disabled={!enabled || currentUserId === undefined}
          />
        </li>
      ))}
    </ul>
  );
}
