import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HabitActions } from "./habit-actions";

describe("habit header actions", () => {
  it.each([false, true])(
    "uses compact ghost actions for archived=%s",
    (archived) => {
      const html = renderToStaticMarkup(
        <HabitActions
          archived={archived}
          disabled={false}
          onCreate={vi.fn()}
          onToggleArchive={vi.fn()}
        />,
      );
      expect(html).toContain("h-7! px-1.5! font-normal text-muted");
      expect(html).not.toContain("bg-primary");
      expect(html).toContain(archived ? "Active habits" : "Archive");
      expect(html).toContain(archived ? "lucide-arrow-left" : "lucide-archive");
      if (archived) expect(html).not.toContain("Add habit");
      else expect(html).toContain("Add habit");
    },
  );
});
