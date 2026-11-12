import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { CalendarItemEditor } from "./calendar-item-editor";

const row = { title: "Dinner", note: "", day: "2026-11-12", people: [] };
vi.mock("@rocicorp/zero/react", () => ({
  useQuery: () => [row, { type: "complete" }],
  useZero: () => ({ mutate: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: () => ({ status: "idle" }),
}));
const props = {
  householdId: crypto.randomUUID(),
  itemId: crypto.randomUUID(),
  initialValue: { ...row, people: [] as string[] },
  existing: true,
  enabled: true,
  members: [],
  onClose() {},
  onFollow() {},
  controls: { current: null },
};
it("edits the name directly in a divided row, not in an item form/dialog", () => {
  const html = renderToStaticMarkup(
    <ul>
      <CalendarItemEditor {...props} />
    </ul>,
  );
  expect(html).toContain("data-calendar-editing=");
  expect(html).toContain('aria-label="Calendar item name"');
  expect(html).toContain('value="Dinner"');
  expect(html).toContain('aria-label="Edit calendar note"');
  expect(html).toContain('aria-label="Calendar item actions"');
  expect(html).not.toContain('role="dialog"');
  expect(html).not.toContain("<form");
  expect(html).not.toContain("<label");
  expect(html).not.toContain('type="date"');
  expect(html).not.toContain("<textarea");
});
it("opens a seamless inline note only when requested or already populated", () => {
  const html = renderToStaticMarkup(
    <ul>
      <CalendarItemEditor {...props} focus="note" />
    </ul>,
  );
  expect(html).toContain('aria-label="Calendar item note"');
  expect(html).toContain('placeholder="Note"');
  expect(html).not.toContain('role="dialog"');
});
it("keeps existing multiline note content visible and inspectable when offline", () => {
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
