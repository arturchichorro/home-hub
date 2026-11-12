import { habitMonth, shiftCalendarDate } from "@home-hub/shared/habits";

export function CalendarMonth({
  month,
  selected,
  today,
  items,
  onSelect,
  disabled = false,
}: {
  month: string;
  selected: string;
  today: string;
  items: readonly { id: string; day: string; title: string }[];
  onSelect: (day: string) => void;
  disabled?: boolean;
}) {
  const { dates } = habitMonth(month);
  const first = dates[0] ?? month;
  const offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const cells = [...Array.from({ length: offset }, () => ""), ...dates];
  while (cells.length % 7 !== 0) {
    cells.push("");
  }
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );
  const label = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}T12:00:00Z`));
  return (
    <table
      className="w-full table-fixed border-collapse text-sm"
      aria-label={label}
    >
      <thead>
        <tr>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <th
              key={day}
              scope="col"
              className="pb-2 text-center text-xs font-normal text-muted"
            >
              {day}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week.find(Boolean)}>
            {week.map((day, index) => (
              <td
                key={day || `empty-${index}`}
                className="border border-border p-0 align-top"
              >
                {day && (
                  <button
                    type="button"
                    data-calendar-day={day}
                    disabled={disabled}
                    aria-pressed={selected === day}
                    aria-current={today === day ? "date" : undefined}
                    tabIndex={
                      selected === day ||
                      (!dates.includes(selected) && day === first)
                        ? 0
                        : -1
                    }
                    aria-label={`${day}, ${items.filter((item) => item.day === day).length} items`}
                    className={`grid h-20 w-full min-w-0 content-start gap-1 p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring sm:h-24 sm:p-2 ${selected === day ? "bg-raised" : "hover:bg-raised/50"}`}
                    onClick={() => onSelect(day)}
                    onKeyDown={(event) => {
                      const deltas: Record<string, number> = {
                        ArrowLeft: -1,
                        ArrowRight: 1,
                        ArrowUp: -7,
                        ArrowDown: 7,
                        Home: -index,
                        End: 6 - index,
                      };
                      const delta = deltas[event.key];
                      if (delta === undefined) {
                        return;
                      }
                      event.preventDefault();
                      const next = shiftCalendarDate(day, delta);
                      if (next < "0001-01-01" || next > "9999-12-31") {
                        return;
                      }
                      onSelect(next);
                      requestAnimationFrame(() =>
                        document
                          .querySelector<HTMLButtonElement>(
                            `[data-calendar-day="${next}"]`,
                          )
                          ?.focus(),
                      );
                    }}
                  >
                    <span
                      className={`text-center text-xs ${today === day ? "font-bold text-foreground" : "text-muted"}`}
                    >
                      {Number(day.slice(-2))}
                    </span>
                    {items
                      .filter((item) => item.day === day)
                      .slice(0, 2)
                      .map((item) => (
                        <span
                          key={item.id}
                          className="block min-w-0 truncate text-[10px] leading-4 sm:text-xs"
                        >
                          {item.title}
                        </span>
                      ))}
                    {items.filter((item) => item.day === day).length > 2 && (
                      <span className="text-[10px] text-muted">
                        +{items.filter((item) => item.day === day).length - 2}
                      </span>
                    )}
                  </button>
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
