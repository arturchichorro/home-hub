import { Button, Tooltip } from "@home-hub/ui-web";
import { HabitCompletionMarks } from "./habit-completion-marks";
import { HabitMemberMark } from "./habit-member-mark";

export type HabitCalendarProps = {
  habit: {
    id: string;
    name: string;
    note?: string | null;
    entries: readonly {
      userId: string;
      entryOn: string;
      completed: boolean | null;
      note?: string | null;
    }[];
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
    habit.entries.some(
      (entry) =>
        entry.userId === member.userId &&
        entry.entryOn === date &&
        entry.completed === true,
    ),
  );
  const notedMembers = members.filter((member) =>
    habit.entries.some(
      (entry) =>
        entry.userId === member.userId && entry.entryOn === date && entry.note,
    ),
  );
  const detailMembers = members.filter(
    (member) =>
      completedMembers.includes(member) || notedMembers.includes(member),
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
      disabled={detailMembers.length === 0}
      delay={200}
      content={
        <div className="grid gap-1">
          <ul>
            {detailMembers.map((member) => {
              const note = habit.entries.find(
                (entry) =>
                  entry.userId === member.userId && entry.entryOn === date,
              )?.note;
              return (
                <li key={member.userId} className="grid gap-1">
                  <span className="flex items-center gap-1.5">
                    {completedMembers.includes(member) ? (
                      <HabitMemberMark color={colors.get(member.userId)} />
                    ) : null}
                    {member.user?.username ?? "Member"}
                  </span>
                  {note ? (
                    <p className="break-words whitespace-pre-wrap text-xs text-muted">
                      {note}
                    </p>
                  ) : null}
                </li>
              );
            })}
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
