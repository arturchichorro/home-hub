import type { HabitStats } from "@home-hub/shared/habit-stats";
import { Button, InlineAlert } from "@home-hub/ui-web";
import { formatHabitDate } from "./habit-days";

export function HabitStatistics({
  data,
  error,
  archived,
  onRetry,
}: {
  data: HabitStats | undefined;
  error: string | undefined;
  archived: boolean;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <InlineAlert role="alert" variant="danger">
        {error}{" "}
        <Button variant="ghost" size="compact" onClick={onRetry}>
          Retry
        </Button>
      </InlineAlert>
    );
  }
  if (!data) {
    return (
      <p role="status" className="text-sm text-muted">
        Loading statistics…
      </p>
    );
  }
  const values = [
    ["Completed days", String(data.completedDays)],
    ["Last completion", data.lastOn ? formatHabitDate(data.lastOn) : "—"],
    ["Last 7 days", `${data.last7}/7`],
    ["Last 30 days", `${data.last30}/30`],
    ...(!archived
      ? [
          [
            "Current weekly streak",
            `${data.currentWeeks} ${data.currentWeeks === 1 ? "week" : "weeks"}`,
          ],
        ]
      : []),
    [
      "Best weekly streak",
      `${data.bestWeeks} ${data.bestWeeks === 1 ? "week" : "weeks"}`,
    ],
  ];
  return (
    <section
      aria-label="Habit statistics"
      className="grid gap-3 border-t border-border pt-4"
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        {values.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="mt-1 break-words text-sm font-medium tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted">
        Weekly streaks need one completion per Mon–Sun week.
        {!archived && " This week stays open until Sunday."}
      </p>
    </section>
  );
}
