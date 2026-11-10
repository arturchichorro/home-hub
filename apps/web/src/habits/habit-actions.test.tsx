import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { HabitActions } from "./habit-actions";

it.each([false, true])(
  "keeps secondary management in one options menu (archived=%s)",
  (archived) => {
    const html = renderToStaticMarkup(
      <HabitActions
        archived={archived}
        disabled={false}
        onCreate={vi.fn()}
        onToggleArchive={vi.fn()}
      />,
    );
    expect(html).toContain('aria-label="Habit options"');
    expect(html).not.toContain("bg-primary");
    if (archived) {
      expect(html).not.toContain("Add habit");
    } else {
      expect(html).toContain("Add habit");
      expect(html).toContain("h-7! px-1.5! font-normal text-muted");
    }
  },
);
