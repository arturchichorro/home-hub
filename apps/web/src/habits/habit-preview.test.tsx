import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { HabitPreview } from "./habit-preview";

it("shows seven non-interactive chronological days across month/year boundaries", () => {
  const html = renderToStaticMarkup(
    <HabitPreview name="Read" today="2027-01-03" entries={[]} />,
  );
  expect(
    [...html.matchAll(/aria-label="([0-9-]+):/g)].map((match) => match[1]),
  ).toEqual([
    "2026-12-28",
    "2026-12-29",
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
    "2027-01-03",
  ]);
  expect(html).not.toMatch(/<button|<input|<a |tabindex=/);
  expect(html).toContain('aria-current="date"');
});
it("shows note-only markers without completion and recognizes training completion", () => {
  const html = renderToStaticMarkup(
    <HabitPreview
      name="Read"
      today="2026-11-03"
      entries={[
        {
          userId: "me",
          entryOn: "2026-11-02",
          completed: false,
          note: "Stored note",
        },
        {
          userId: "me",
          entryOn: "2026-11-03",
          completed: false,
          workoutCompleted: true,
        },
      ]}
    />,
  );
  expect(html).toContain("2026-11-02: Not recorded, has note");
  expect(html).toContain("2026-11-03: Completed");
});
