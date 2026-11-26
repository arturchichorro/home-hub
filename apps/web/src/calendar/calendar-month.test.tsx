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
        endDay: null,
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
  expect(html.match(/data-calendar-day=/gu)).toHaveLength(42);
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
  expect(html.match(/data-calendar-day=/gu)).toHaveLength(35);
  expect(html).toContain('data-calendar-day="2024-02-29"');
  expect(html).toContain('data-calendar-day="2024-03-01"');
  expect(html).toContain('aria-current="date"');
});
it("previews adjacent-month items with muted dates and an explicit accessible label", () => {
  const html = renderToStaticMarkup(
    <CalendarMonth
      month="2026-11-01"
      selected={day}
      today={day}
      onSelect={() => {}}
      items={[
        {
          id: "before",
          day: "2026-10-31",
          endDay: null,
          title: "October event",
        },
        {
          id: "after",
          day: "2026-12-01",
          endDay: null,
          title: "December event",
        },
      ]}
    />,
  );
  expect(html).toContain("October event");
  expect(html).toContain("December event");
  expect(html.match(/data-calendar-outside-month="true"/gu)).toHaveLength(12);
  const adjacent = html
    .split('data-calendar-day="2026-12-01"')[1]
    ?.split("</button>")[0];
  expect(adjacent).toContain("text-muted/80");
  expect(adjacent).toContain(
    'aria-label="2026-12-01, 1 items, outside displayed month"',
  );
});
it.each(["2026-10-31", "2026-12-01", "2027-01-01"])(
  "keeps one grid tab stop with selection %s",
  (selected) => {
    const html = renderToStaticMarkup(
      <CalendarMonth
        month="2026-11-01"
        selected={selected}
        today={day}
        items={[]}
        onSelect={() => {}}
      />,
    );
    expect(html.match(/tabindex="0"/gu)).toHaveLength(1);
  },
);
it("leaves only unsupported days blank at the upper year boundary", () => {
  const html = renderToStaticMarkup(
    <CalendarMonth
      month="9999-12-01"
      selected="9999-12-31"
      today={day}
      items={[]}
      onSelect={() => {}}
    />,
  );
  expect(html.match(/data-calendar-day=/gu)).toHaveLength(33);
  expect(html.match(/<td/gu)).toHaveLength(35);
  expect(html).not.toContain("10000");
});
it("shows one preview per covered day across months, with inclusive endpoints", () => {
  const html = renderToStaticMarkup(
    <CalendarMonth
      month="2026-11-01"
      selected={day}
      today={day}
      onSelect={() => {}}
      items={[
        { id: "trip", title: "Trip", day: "2026-11-30", endDay: "2026-12-02" },
      ]}
    />,
  );
  expect(html.match(/>Trip</gu)).toHaveLength(3);
  for (const date of ["2026-11-30", "2026-12-01", "2026-12-02"]) {
    expect(html).toContain(`aria-label="${date}, 1 items`);
  }
  expect(html).toContain('aria-label="2026-12-03, 0 items');
});
it("renders only visible days even for a range covering every supported year", () => {
  const html = renderToStaticMarkup(
    <CalendarMonth
      month="2026-11-01"
      selected={day}
      today={day}
      onSelect={() => {}}
      items={[
        {
          id: "long",
          title: "Long span",
          day: "0001-01-01",
          endDay: "9999-12-31",
        },
      ]}
    />,
  );
  expect(html.match(/>Long span</gu)).toHaveLength(42);
  expect(html).not.toContain("9999");
});
it("escapes titles rather than interpreting notes or markup", () => {
  const html = renderToStaticMarkup(
    <CalendarMonth
      month="2026-11-01"
      selected={day}
      today={day}
      items={[{ id: "x", day, endDay: null, title: "<script>bad()</script>" }]}
      onSelect={() => {}}
    />,
  );
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
});
