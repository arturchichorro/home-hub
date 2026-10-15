import { Button, Tooltip } from "@home-hub/ui-web";

const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

// Stable per account, independent of roster ordering, habit and displayed month.
export function habitMemberColor(userId: string): string {
  let hash = 2166136261;
  for (const character of userId) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  const hue = (hash / 2 ** 32) * 360;
  return `oklch(var(--member-marker-lightness) var(--member-marker-chroma) ${hue})`;
}

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

type Member = { userId: string; user?: { username: string } | undefined };
type Props = {
  habit: {
    id: string;
    name: string;
    createdOn: string;
    completions: readonly { userId: string; completedOn: string }[];
  };
  members: readonly Member[];
  currentUserId: string | undefined;
  dates: readonly string[];
  today: string;
  label: string;
  archived: boolean;
  enabled: boolean;
  pending: ReadonlySet<string>;
  onSetCompleted: (date: string, completed: boolean) => void;
};

export function HabitMonthCalendar({
  habit,
  members,
  currentUserId,
  dates,
  today,
  label,
  archived,
  enabled,
  pending,
  onSetCompleted,
}: Props) {
  const weeks = monthCalendarWeeks(dates);
  const participants = members.filter(
    (member) =>
      member.userId === currentUserId ||
      habit.completions.some(
        (completion) => completion.userId === member.userId,
      ),
  );
  return (
    <div className="grid min-w-0 gap-3">
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
                  className="border-b border-border py-2 text-center text-xs font-medium text-muted"
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
                {week.map((date, dayIndex) => {
                  if (date === null)
                    return (
                      <td
                        key={weekdays[dayIndex]}
                        aria-hidden="true"
                        className="border border-border bg-surface"
                      />
                    );
                  const completedMembers = members.filter((member) =>
                    habit.completions.some(
                      (completion) =>
                        completion.userId === member.userId &&
                        completion.completedOn === date,
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
                    <td
                      key={date}
                      className="h-24 border border-border p-0 align-top sm:h-32"
                    >
                      <Tooltip
                        disabled={completedMembers.length === 0}
                        delay={200}
                        content={
                          <div className="grid gap-1">
                            <p className="font-medium">{date}</p>
                            <ul>
                              {completedMembers.map((member) => (
                                <li key={member.userId}>
                                  <span
                                    aria-hidden="true"
                                    style={{
                                      color: habitMemberColor(member.userId),
                                    }}
                                  >
                                    X{" "}
                                  </span>
                                  {member.user?.username ?? "Member"}
                                </li>
                              ))}
                            </ul>
                          </div>
                        }
                        trigger={
                          <Button
                            variant="ghost"
                            className="h-full! w-full! items-stretch! justify-start! rounded-none! p-2! text-left [&>span]:w-full"
                            aria-label={`${habit.name}, ${date}. ${completionLabel} Your completion: ${ownCompleted ? "recorded" : "not recorded"}.`}
                            aria-pressed={ownCompleted}
                            disabled={!canEdit}
                            focusableWhenDisabled
                            onClick={() => {
                              if (canEdit) onSetCompleted(date, !ownCompleted);
                            }}
                          >
                            <span className="flex w-full flex-col items-start gap-2">
                              <span
                                aria-current={
                                  date === today ? "date" : undefined
                                }
                                className={`inline-flex size-6 items-center justify-center rounded-full text-xs ${date === today ? "bg-primary text-on-primary" : "text-muted"}`}
                              >
                                {Number(date.slice(8))}
                              </span>
                              <span
                                aria-hidden="true"
                                className="flex flex-wrap gap-x-2 gap-y-1 text-lg font-semibold"
                              >
                                {completedMembers.map((member) => (
                                  <span
                                    key={member.userId}
                                    style={{
                                      color: habitMemberColor(member.userId),
                                    }}
                                  >
                                    X
                                  </span>
                                ))}
                              </span>
                            </span>
                          </Button>
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul
        aria-label="Monthly completion totals"
        className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted"
      >
        {participants.map((member) => {
          const count = habit.completions.filter(
            (completion) => completion.userId === member.userId,
          ).length;
          return (
            <li
              key={member.userId}
              className="inline-flex items-center gap-1.5"
            >
              <span
                aria-hidden="true"
                className="font-semibold"
                style={{ color: habitMemberColor(member.userId) }}
              >
                X
              </span>
              <span>
                {member.user?.username ?? "Member"}
                {member.userId === currentUserId ? " (you)" : ""}: {count}{" "}
                {count === 1 ? "day" : "days"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
