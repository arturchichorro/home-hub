import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CalendarMonth } from "./calendar-month";

const day = "2026-11-11";
it("renders a Monday-first semantic month with two previews, overflow count and selected/today state", () => {
  const html = renderToStaticMarkup(
    <CalendarMonth
      month="2026-11-01"
      selected={day}
      today={day}
      onSelect={() => {}}
      items={["First", "Second", "Third"].map((title) => ({
        id: title,
        title,
        day,
      }))}
    />,
  );
  expect(html).toContain('aria-label="November 2026"');
  expect(html.indexOf(">Mon<")).toBeLessThan(html.indexOf(">Sun<"));
  expect(html).toContain("First");
  expect(html).toContain("Second");
  expect(html).not.toContain("Third");
  expect(html).toContain("+1");
  expect(html).toContain('aria-label="2026-11-11, 3 items"');
  expect(html).toContain('aria-current="date"');
  expect(html.match(/tabindex="0"/gu)).toHaveLength(1);
  expect(html.match(/data-calendar-day=/gu)).toHaveLength(30);
});
it("renders leap February and handles literal dates without local-time conversion", () => {
  const html = renderToStaticMarkup(
    <CalendarMonth
      month="2024-02-01"
      selected="2024-02-29"
      today="2024-03-01"
      items={[]}
      onSelect={() => {}}
    />,
  );
  expect(html.match(/data-calendar-day=/gu)).toHaveLength(29);
  expect(html).toContain('data-calendar-day="2024-02-29"');
  expect(html).not.toContain('aria-current="date"');
});
it("escapes titles rather than interpreting notes or markup", () => {
  const html = renderToStaticMarkup(
    <CalendarMonth
      month="2026-11-01"
      selected={day}
      today={day}
      items={[{ id: "x", day, title: "<script>bad()</script>" }]}
      onSelect={() => {}}
    />,
  );
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
});
