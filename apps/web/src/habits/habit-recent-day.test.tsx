import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { HabitRecentDay } from "./habit-days";

const date = "2026-11-03";

it("shows an X only for completion and labels the rightmost date Today", () => {
  const completed = renderToStaticMarkup(
    <HabitRecentDay
      name="Read"
      date={date}
      today={date}
      entry={{ userId: "me", entryOn: date, completed: true }}
      onInspect={() => {}}
      onToggle={() => {}}
    />,
  );
  expect(completed).toContain('aria-current="date"');
  expect(completed).toContain('aria-pressed="true"');
  expect(completed).toContain("lucide-x");
  expect(completed).toContain(">Today<");

  const blank = renderToStaticMarkup(
    <HabitRecentDay
      name="Read"
      date={date}
      today={date}
      onInspect={() => {}}
      onToggle={() => {}}
    />,
  );
  expect(blank).not.toContain("lucide-x");
  expect(blank).toContain('aria-pressed="false"');
});

it("keeps note-only dates unmarked and readonly inspection available", () => {
  const html = renderToStaticMarkup(
    <HabitRecentDay
      name="Read"
      date="2026-11-02"
      today={date}
      entry={{
        userId: "other",
        entryOn: "2026-11-02",
        completed: false,
        note: "A note",
      }}
      onInspect={() => {}}
      selected
    />,
  );
  expect(html).toContain("Not recorded. Note: A note");
  expect(html).not.toContain("lucide-x");
  expect(html).not.toContain("aria-pressed");
  expect(html).toContain('aria-expanded="true"');
  expect(html).not.toContain('disabled=""');
});

it("shows an automatic X without exposing source workout data", () => {
  const html = renderToStaticMarkup(
    <HabitRecentDay
      name="Read"
      date={date}
      today={date}
      entry={{
        userId: "me",
        entryOn: date,
        completed: false,
        workoutCompleted: true,
      }}
      onInspect={() => {}}
    />,
  );
  expect(html).toContain("lucide-x");
  expect(html).toContain("Completed from a matching workout");
  expect(html).not.toContain("Mark done");
  expect(html).not.toContain("Clear completion");
});

it("disables a pending or offline today write", () => {
  expect(
    renderToStaticMarkup(
      <HabitRecentDay
        name="Read"
        date={date}
        today={date}
        onInspect={() => {}}
        onToggle={() => {}}
        disabled
      />,
    ),
  ).toContain('disabled=""');
});
