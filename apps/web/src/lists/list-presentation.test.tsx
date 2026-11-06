import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  checklistPreviewRows,
  checklistPreviewWindow,
} from "./checklist-preview";
import { ListKindPicker } from "./list-kind-picker";
import { moodboardColumnCount, moodboardColumns } from "./moodboard-layout";

it("offers two named native radio choices with a selected icon, not a select", () => {
  const markup = renderToStaticMarkup(
    <ListKindPicker value="moodboard" onChange={() => {}} />,
  );
  expect(markup.match(/type="radio"/g)).toHaveLength(2);
  expect(markup).toContain("Checklist");
  expect(markup).toContain("Moodboard");
  expect(markup).toMatch(/checked="" value="moodboard"/);
  expect(markup).not.toContain("<select");
});

describe("checklist preview", () => {
  it("uses taller row space, with bounded rows", () => {
    expect(checklistPreviewRows(132)).toBe(4);
    expect(checklistPreviewRows(300)).toBe(8);
    expect(checklistPreviewRows(10_000)).toBe(20);
  });

  it("shows every item when they fit", () => {
    expect(checklistPreviewWindow([1, 2, 3, 4], 4)).toEqual({
      visible: [1, 2, 3, 4],
      clipped: false,
    });
  });

  it("reserves the final row for an ellipsis with at least two hidden items", () => {
    for (const length of [5, 6, 22]) {
      const items = Array.from({ length }, (_, index) => index);
      const preview = checklistPreviewWindow(items, 4);
      expect(preview.visible).toHaveLength(3);
      expect(preview.clipped).toBe(true);
      expect(items.length - preview.visible.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("moodboard columns", () => {
  it("uses container width, not the viewport behind the sidebar", () => {
    expect(moodboardColumnCount(358)).toBe(2);
    expect(moodboardColumnCount(700)).toBe(3);
    expect(moodboardColumnCount(1400)).toBe(4);
  });

  it("fills every track and retains down-column order, including awkward pin counts", () => {
    for (const length of [1, 2, 3, 6, 9, 50, 10000]) {
      const pins = Array.from({ length }, (_, index) => ({
        id: `pin-${index}`,
        asset: {
          id: `asset-${index}`,
          kind: "image" as const,
          width: 200,
          height: index % 3 ? 100 : 500,
        },
      }));
      const columns = moodboardColumns(pins, 4);
      expect(columns).toHaveLength(Math.min(4, length));
      expect(columns.every((column) => column.pins.length > 0)).toBe(true);
      expect(columns.flatMap((column) => column.pins)).toEqual(pins);
    }
  });
});
