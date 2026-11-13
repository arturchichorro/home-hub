import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { CalendarItemEditor } from "./calendar-item-editor";

const row = { title: "Dinner", note: "", day: "2026-11-12", people: [] };
vi.mock("@rocicorp/zero/react", () => ({
  useQuery: () => [row, { type: "complete" }],
  useZero: () => ({ mutate: vi.fn() }),
}));
vi.mock("@dnd-kit/react/sortable", () => ({
  useSortable: () => ({ ref: vi.fn(), handleRef: vi.fn() }),
}));
const props = {
  householdId: crypto.randomUUID(),
  itemId: crypto.randomUUID(),
  initialValue: { ...row, people: [] as string[] },
  existing: true,
  enabled: true,
  members: [],
  onRemoved() {},
  onFollow() {},
  async beforeMove() {
    return true;
  },
  endMove() {},
  onActivityChange() {},
  controls: { current: null },
  index: 0,
  orderDisabled: false,
  blocked: false,
};
it("always renders seamless name input and actions without click-to-edit or Done", () => {
  const html = renderToStaticMarkup(
    <ul>
      <CalendarItemEditor {...props} />
    </ul>,
  );
  expect(html).toContain("data-calendar-item=");
  expect(html).toContain('aria-label="Calendar item name"');
  expect(html).toContain('value="Dinner"');
  expect(html).toContain('aria-label="Add calendar note"');
  expect(html).toContain('aria-label="Calendar item actions"');
  expect(html).toContain('aria-label="Calendar item people"');
  expect(html).not.toContain("Done editing");
  expect(html).not.toContain("data-calendar-open");
  expect(html).not.toContain('role="dialog"');
  expect(html).not.toContain("<form");
  expect(html).not.toContain("size-10!");
});
it("keeps note editable beside the name with a fixed-height horizontal scrolling input", () => {
  const html = renderToStaticMarkup(
    <ul>
      <CalendarItemEditor
        {...props}
        initialValue={{ ...props.initialValue, note: "Existing note" }}
      />
    </ul>,
  );
  expect(html).toContain('aria-label="Calendar item note"');
  expect(html).toContain("field-sizing-fixed! h-7!");
  expect(html).toContain("overflow-x-auto overflow-y-hidden");
  expect(html).toContain("whitespace-nowrap");
  expect(html).toContain("Existing note");
  expect(html.indexOf('aria-label="Calendar item name"')).toBeLessThan(
    html.indexOf('aria-label="Calendar item note"'),
  );
  expect(html).not.toContain('aria-label="Add calendar note"');
});
it("retains multiline note contents and read-only inspection offline", () => {
  const html = renderToStaticMarkup(
    <ul>
      <CalendarItemEditor
        {...props}
        enabled={false}
        initialValue={{ ...props.initialValue, note: "First\nSecond" }}
      />
    </ul>,
  );
  expect(html).toContain("First\nSecond");
  expect(html).toContain("readOnly");
  expect(html).not.toContain('role="dialog"');
});
