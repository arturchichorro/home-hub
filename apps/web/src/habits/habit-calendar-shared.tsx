import { Button, Tooltip } from "@home-hub/ui-web";
import { HabitCompletionMarks } from "./habit-completion-marks";
import { HabitMemberMark } from "./habit-member-mark";

export type HabitCalendarProps = {
  habit: {
    id: string;
    name: string;
    note?: string | null;
    completions: readonly { userId: string; completedOn: string }[];
  };
  members: readonly {
    userId: string;
    user?: { username: string } | undefined;
  }[];
  currentUserId: string | undefined;
  dates: readonly string[];
  today: string;
  label: string;
  archived: boolean;
  enabled: boolean;
  pending: ReadonlySet<string>;
  onSetCompleted: (date: string, completed: boolean) => void;
};
type Colors = { colors: ReadonlyMap<string, string> };

export function HabitDay({
  habit,
  members,
  currentUserId,
  today,
  archived,
  enabled,
  pending,
  onSetCompleted,
  date,
  colors,
}: Omit<HabitCalendarProps, "dates" | "label"> & Colors & { date: string }) {
  const completedMembers = members.filter((member) =>
    habit.completions.some(
      (completion) =>
        completion.userId === member.userId && completion.completedOn === date,
    ),
  );
  const ownCompleted = completedMembers.some(
    (member) => member.userId === currentUserId,
  );
  const names = completedMembers.map(
    (member) => member.user?.username ?? "Member",
  );
  const completionLabel = names.length
    ? `Completed by: ${names.join(", ")}.`
    : "No completions.";
  const canEdit =
    currentUserId !== undefined &&
    enabled &&
    !archived &&
    date <= today &&
    !pending.has(habit.id) &&
    !pending.has(`${habit.id}:${date}`);
  return (
    <Tooltip
      disabled={completedMembers.length === 0}
      delay={200}
      content={
        <div className="grid gap-1">
          <ul>
            {completedMembers.map((member) => (
              <li key={member.userId} className="flex items-center gap-1.5">
                <HabitMemberMark color={colors.get(member.userId)} />
                {member.user?.username ?? "Member"}
              </li>
            ))}
          </ul>
        </div>
      }
      trigger={
        <Button
          variant="ghost"
          className={`h-full! w-full! items-stretch! justify-start! rounded-none! p-1! text-center [&>span]:min-w-0 [&>span]:w-full [&>span]:items-start ${ownCompleted ? "bg-raised!" : ""}`}
          aria-label={`${habit.name}, ${date}. ${completionLabel} Your completion: ${ownCompleted ? "recorded" : "not recorded"}.`}
          aria-pressed={ownCompleted}
          disabled={!canEdit}
          focusableWhenDisabled
          onClick={() => {
            if (canEdit) onSetCompleted(date, !ownCompleted);
          }}
        >
          <span className="flex w-full min-w-0 flex-col items-center gap-1">
            <span
              aria-current={date === today ? "date" : undefined}
              className={`inline-flex size-5 items-center justify-center text-xs ${date === today ? "font-bold text-foreground" : "text-muted"}`}
            >
              {Number(date.slice(8))}
            </span>
            <HabitCompletionMarks members={completedMembers} colors={colors} />
          </span>
        </Button>
      }
    />
  );
}
