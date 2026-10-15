import { Button, Tooltip } from "@home-hub/ui-web";
import { HabitMemberMark } from "./habit-member-mark";

export type HabitCalendarProps = {
  habit: {
    id: string;
    name: string;
    createdOn: string;
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
    date >= habit.createdOn &&
    date <= today &&
    !pending.has(habit.id) &&
    !pending.has(`${habit.id}:${date}`);
  return (
    <Tooltip
      disabled={completedMembers.length === 0}
      delay={200}
      content={
        <div className="grid gap-1">
          <p className="font-medium">{date}</p>
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
          className="h-full! w-full! items-stretch! justify-start! rounded-none! p-1! text-center [&>span]:w-full [&>span]:items-start"
          aria-label={`${habit.name}, ${date}. ${completionLabel} Your completion: ${ownCompleted ? "recorded" : "not recorded"}.`}
          aria-pressed={ownCompleted}
          disabled={!canEdit}
          focusableWhenDisabled
          onClick={() => {
            if (canEdit) onSetCompleted(date, !ownCompleted);
          }}
        >
          <span className="flex w-full flex-col items-center gap-1">
            <span
              aria-current={date === today ? "date" : undefined}
              className={`inline-flex size-5 items-center justify-center rounded-full text-xs ${date === today ? "bg-primary text-on-primary" : "text-muted"}`}
            >
              {Number(date.slice(8))}
            </span>
            <span
              aria-hidden="true"
              className="flex w-full flex-wrap justify-center gap-x-1 gap-y-0.5"
            >
              {completedMembers.map((member) => (
                <HabitMemberMark
                  key={member.userId}
                  color={colors.get(member.userId)}
                />
              ))}
            </span>
          </span>
        </Button>
      }
    />
  );
}

export function HabitCompletionTotals({
  habit,
  members,
  currentUserId,
  colors,
}: Pick<HabitCalendarProps, "habit" | "members" | "currentUserId"> & Colors) {
  const participants = members.filter(
    (member) =>
      member.userId === currentUserId ||
      habit.completions.some(
        (completion) => completion.userId === member.userId,
      ),
  );
  return (
    <ul
      aria-label="Monthly completion totals"
      className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted"
    >
      {participants.map((member) => {
        const count = habit.completions.filter(
          (completion) => completion.userId === member.userId,
        ).length;
        return (
          <li key={member.userId} className="inline-flex items-center gap-1.5">
            <HabitMemberMark color={colors.get(member.userId)} />
            <span>
              {member.user?.username ?? "Member"}
              {member.userId === currentUserId ? " (you)" : ""}: {count}{" "}
              {count === 1 ? "day" : "days"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
