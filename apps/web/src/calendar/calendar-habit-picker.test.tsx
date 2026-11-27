import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { CalendarHabitPicker } from "./calendar-habit-picker";

const fixture = vi.hoisted(() => ({
  enabled: true,
  link: undefined as
    | { habitId: string; habit?: { name: string; status: string } }
    | undefined,
  connected: true,
}));
vi.mock("@home-hub/shared/zero/queries", () => ({
  queries: {
    modules: { byHousehold: () => ({ kind: "modules" }) },
    calendar: {
      habitAttachment: () => ({ kind: "link" }),
      habitChoices: () => ({ kind: "choices" }),
    },
  },
}));
vi.mock("@rocicorp/zero/react", () => ({
  useQuery: ({ kind }: { kind: string }) => [
    kind === "modules"
      ? [{ moduleKey: "habits", enabled: fixture.enabled }]
      : kind === "link"
        ? fixture.link
        : [],
    { type: "complete" },
  ],
  useConnectionState: () => ({
    name: fixture.connected ? "connected" : "disconnected",
  }),
  useZero: () => ({ mutate: vi.fn() }),
}));
beforeEach(() => {
  fixture.enabled = true;
  fixture.link = undefined;
  fixture.connected = true;
});
const props = {
  householdId: crypto.randomUUID(),
  itemId: crypto.randomUUID(),
  singleDay: true,
  saved: true,
  disabled: false,
  beforeChange: async () => true,
  onActivityChange() {},
  controls: { current: null },
};
function render(overrides: Partial<typeof props> = {}) {
  return renderToStaticMarkup(
    <CalendarHabitPicker {...props} {...overrides}>
      {({ action, chip }: { action: ReactNode; chip: ReactNode }) => (
        <div>
          <div data-actions>{action}</div>
          <div data-chip>{chip}</div>
        </div>
      )}
    </CalendarHabitPicker>,
  );
}
it("adds only a compact picker action to saved single-day rows, without an extra checkbox or form", () => {
  const html = render();
  expect(html).toContain('aria-label="Attach habit to calendar item"');
  expect(html).toContain("size-7!");
  expect(html).not.toContain("checkbox");
  expect(html).not.toContain("<form");
  expect(render({ singleDay: false })).not.toContain(
    'aria-label="Attach habit',
  );
  expect(render({ saved: false })).not.toContain('aria-label="Attach habit');
});
it("shows the personal name chip below the row rather than squeezing the primary action bar", () => {
  fixture.link = {
    habitId: "one",
    habit: { name: "Climbing", status: "active" },
  };
  const html = render();
  expect(html).toContain('aria-label="Calendar item habit attachment"');
  expect(html).toContain("Climbing");
  expect(html.indexOf("data-chip")).toBeLessThan(html.indexOf("Climbing"));
  expect(html).not.toContain('aria-label="Attach habit to calendar item"');
});
it("keeps archived attachments visible but marks them archived", () => {
  fixture.link = {
    habitId: "one",
    habit: { name: "Climbing", status: "archived" },
  };
  expect(render()).toContain("(archived)");
});
it("allows only a generic cleanup control when Habits is disabled and exposes no habit details", () => {
  fixture.enabled = false;
  expect(render()).not.toContain('aria-label="Attach habit');
  fixture.link = { habitId: "private-id" };
  const html = render();
  expect(html).toContain("Habit attached");
  expect(html).not.toContain("private-id");
  expect(html).not.toContain("Climbing");
});
it("keeps cached inspection read-only offline", () => {
  fixture.connected = false;
  expect(render()).toMatch(/disabled=""/);
});
