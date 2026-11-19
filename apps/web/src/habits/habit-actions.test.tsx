import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { HabitActions } from "./habit-actions";

it.each([false, true])(
  "offers direct archive navigation without an options/reorder menu (archived=%s)",
  (archived) => {
    const html = renderToStaticMarkup(
      <HabitActions
        archived={archived}
        disabled={false}
        onCreate={vi.fn()}
        onToggleArchive={vi.fn()}
      />,
    );
    expect(html).toContain(
      `aria-label="${archived ? "Active habits" : "Archived habits"}"`,
    );
    expect(html).not.toMatch(
      /Habit options|Reorder habits|Finish reordering|aria-haspopup/,
    );
    expect(html).not.toContain("bg-primary");
    if (archived) {
      expect(html).not.toContain("Add habit");
    } else {
      expect(html).toContain("Add habit");
      expect(html).toContain("h-7! px-1.5! font-normal text-muted");
    }
  },
);
it("keeps cached archive navigation available offline, but locks it for pending drafts", () => {
  const offline = renderToStaticMarkup(
    <HabitActions
      archived={false}
      disabled
      onCreate={vi.fn()}
      onToggleArchive={vi.fn()}
    />,
  );
  expect(
    offline.match(/<button[^>]*aria-label="Archived habits"[^>]*>/)?.[0],
  ).not.toContain('disabled=""');
  const locked = renderToStaticMarkup(
    <HabitActions
      archived={false}
      disabled
      navigationDisabled
      onCreate={vi.fn()}
      onToggleArchive={vi.fn()}
    />,
  );
  expect(
    locked.match(/<button[^>]*aria-label="Archived habits"[^>]*>/)?.[0],
  ).toContain('disabled=""');
});
