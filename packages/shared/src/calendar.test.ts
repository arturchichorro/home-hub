import type { AST } from "@rocicorp/zero";
import { describe, expect, it } from "vitest";
import {
  calendarChanges,
  calendarCreateSchema,
  calendarDatesSchema,
  calendarFieldsSchema,
  calendarItemIncludesDay,
  calendarMonthGrid,
  calendarPersonSchema,
  calendarRangeLabel,
  calendarRangeSchema,
  calendarReorderSchema,
  calendarUpdateSchema,
} from "./calendar";
import { queries } from "./zero/queries";

const householdId = crypto.randomUUID();
const itemId = crypto.randomUUID();
const userId = crypto.randomUUID();
const base = { householdId, itemId, optimisticTimestamp: 1 };
const fields = {
  day: "2026-11-11",
  endDay: null,
  title: "Dinner",
  note: "One\nTwo",
};

it("accepts duplicate-friendly plain text, normalizes titles and preserves notes", () => {
  expect(
    calendarCreateSchema.parse({
      ...base,
      ...fields,
      title: "  Family   dinner ",
    }),
  ).toEqual({ ...base, ...fields, title: "Family dinner" });
  expect(calendarFieldsSchema.parse({ ...fields, note: "" }).note).toBe("");
  expect(
    calendarFieldsSchema.parse({ ...fields, note: "  One\n\nTwo  " }).note,
  ).toBe("  One\n\nTwo  ");
});
it.each([
  "2026-02-29",
  "2026-02-30",
  "2026-13-01",
  "2026-1-01",
  "0000-01-01",
  "2026-11-11T10:00:00Z",
])("rejects invalid/non-date-only day %s", (day) => {
  expect(calendarFieldsSchema.safeParse({ ...fields, day }).success).toBe(
    false,
  );
});
it.each(["0001-01-01", "2024-02-29", "9999-12-31"])(
  "accepts past/future date %s",
  (day) => {
    expect(calendarFieldsSchema.safeParse({ ...fields, day }).success).toBe(
      true,
    );
  },
);
it("enforces limits, rejects NUL and never accepts unexpected scheduling fields", () => {
  for (const patch of [
    { title: " " },
    { title: "x".repeat(151) },
    { note: "x".repeat(10001) },
    { note: "a\u0000b" },
    { title: "a\u0000b" },
  ]) {
    expect(
      calendarFieldsSchema.safeParse({ ...fields, ...patch }).success,
    ).toBe(false);
  }
  expect(
    calendarCreateSchema.safeParse({ ...base, ...fields, time: "10:00" })
      .success,
  ).toBe(false);
  expect(
    calendarUpdateSchema.safeParse({ ...base, changes: { sortKey: 123 } })
      .success,
  ).toBe(false);
  expect(calendarUpdateSchema.safeParse({ ...base, changes: {} }).success).toBe(
    false,
  );
});
it("patches changed fields only, not a stale complete item snapshot", () => {
  expect(calendarChanges({ ...fields, note: "Changed" }, fields)).toEqual({
    note: "Changed",
  });
  expect(calendarChanges(fields, fields)).toEqual({});
});
it("bounds date queries to the displayed Monday–Sunday grid, including leap years", () => {
  expect(
    calendarRangeSchema.parse({ householdId, month: "2024-02-17" }),
  ).toMatchObject({ startOn: "2024-01-29", endOn: "2024-03-03" });
});
it.each([
  ["2026-11-01", "2026-10-26", "2026-12-06", 42],
  ["2024-02-01", "2024-01-29", "2024-03-03", 35],
  ["2026-01-01", "2025-12-29", "2026-02-01", 35],
  ["2026-12-01", "2026-11-30", "2027-01-03", 35],
  ["2021-02-01", "2021-02-01", "2021-02-28", 28],
  ["0001-01-01", "0001-01-01", "0001-02-04", 35],
  ["9999-12-01", "9999-11-29", "9999-12-31", 33],
])(
  "fills only visible weeks for %s without leaving supported years",
  (month, startOn, endOn, length) => {
    const grid = calendarMonthGrid(month);
    expect(grid.startOn).toBe(startOn);
    expect(grid.endOn).toBe(endOn);
    expect(grid.dates).toHaveLength(length);
    expect(new Set(grid.dates).size).toBe(length);
    expect(
      grid.dates.every(
        (day) => calendarFieldsSchema.shape.day.safeParse(day).success,
      ),
    ).toBe(true);
  },
);
it("validates people and unique reorder identities", () => {
  expect(
    calendarPersonSchema.safeParse({ ...base, userId, selected: true }).success,
  ).toBe(true);
  expect(
    calendarReorderSchema.safeParse({
      ...base,
      day: fields.day,
      orderedIds: [itemId, itemId],
    }).success,
  ).toBe(false);
});

it.each([null, "2026-11-11", "2026-11-12", "2027-01-01", "9999-12-31"])(
  "accepts inclusive finite end date %s without a duration limit",
  (endDay) => {
    expect(
      calendarDatesSchema.safeParse({ day: fields.day, endDay }).success,
    ).toBe(true);
  },
);
it.each([
  "2026-11-10",
  "2026-02-30",
  "0000-01-01",
  "10000-01-01",
  "",
  "2026-11-12T10:00:00Z",
])("rejects invalid or inverted end date %s", (endDay) => {
  expect(
    calendarCreateSchema.safeParse({ ...base, ...fields, endDay }).success,
  ).toBe(false);
});
it("defaults omitted creation ends but never adds an end to unrelated update patches", () => {
  const { endDay: _endDay, ...singleDay } = fields;
  expect(
    calendarCreateSchema.parse({ ...base, ...singleDay }).endDay,
  ).toBeNull();
  expect(
    calendarUpdateSchema.parse({ ...base, changes: { title: "New" } }).changes,
  ).toEqual({ title: "New" });
});
it("patches both date endpoints together, including clearing the range", () => {
  const span = { ...fields, endDay: "2026-11-13" };
  expect(calendarChanges(span, fields)).toEqual({
    day: fields.day,
    endDay: span.endDay,
  });
  expect(calendarChanges({ ...span, day: "2026-11-12" }, span)).toEqual({
    day: "2026-11-12",
    endDay: span.endDay,
  });
  expect(calendarChanges(fields, span)).toEqual({
    day: fields.day,
    endDay: null,
  });
});
it("includes each endpoint and interior day but no surrounding days", () => {
  const span = { day: "2026-11-30", endDay: "2026-12-02" };
  for (const day of ["2026-11-30", "2026-12-01", "2026-12-02"]) {
    expect(calendarItemIncludesDay(span, day)).toBe(true);
  }
  for (const day of ["2026-11-29", "2026-12-03"]) {
    expect(calendarItemIncludesDay(span, day)).toBe(false);
  }
  expect(calendarItemIncludesDay(fields, fields.day)).toBe(true);
  expect(calendarItemIncludesDay(fields, "2026-11-12")).toBe(false);
});
it("labels actual ranges with unambiguous months/years and no timezone conversion", () => {
  expect(calendarRangeLabel(fields)).toBeUndefined();
  expect(calendarRangeLabel({ ...fields, endDay: fields.day })).toBeUndefined();
  const label = calendarRangeLabel({ day: "2026-12-30", endDay: "2027-01-02" });
  for (const part of ["30", "Dec", "2026", "2", "Jan", "2027"]) {
    expect(label).toContain(part);
  }
});

describe("calendar query authorization", () => {
  const ast = (q: unknown) => (q as { ast: AST }).ast;
  it("bounds month rows and requires a live household, membership and enabled module", () => {
    const q = ast(
      queries.calendar.month.fn({
        ctx: { userId },
        args: { householdId, month: fields.day },
      }),
    );
    const filter = JSON.stringify(q.where);
    for (const value of [
      householdId,
      userId,
      "householdMembers",
      "householdModuleSettings",
      "calendar",
      "deletedAt",
      "2026-10-26",
      "2026-12-06",
      "endDay",
    ]) {
      expect(filter).toContain(value);
    }
    expect(q.orderBy).toEqual([
      ["sortKey", "desc"],
      ["id", "asc"],
    ]);
    const people = q.related?.find(
      (r) => r.subquery.table === "calendarPeople",
    )?.subquery;
    expect(JSON.stringify(people?.where)).toContain("householdMembers");
    expect(people?.related?.[0]?.subquery.related?.[0]?.subquery.table).toBe(
      "users",
    );
  });
  it("uses an independent single-item subscription that survives month moves", () => {
    const q = ast(
      queries.calendar.item.fn({
        ctx: { userId },
        args: { householdId, itemId },
      }),
    );
    expect(q.limit).toBe(1);
    expect(JSON.stringify(q.where)).toContain(itemId);
    expect(JSON.stringify(q.where)).not.toContain("2026-11");
  });
});
