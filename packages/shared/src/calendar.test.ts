import type { AST } from "@rocicorp/zero";
import { describe, expect, it } from "vitest";
import {
  calendarChanges,
  calendarCreateSchema,
  calendarFieldsSchema,
  calendarPersonSchema,
  calendarRangeSchema,
  calendarReorderSchema,
  calendarUpdateSchema,
} from "./calendar";
import { queries } from "./zero/queries";

const householdId = crypto.randomUUID();
const itemId = crypto.randomUUID();
const userId = crypto.randomUUID();
const base = { householdId, itemId, optimisticTimestamp: 1 };
const fields = { day: "2026-11-11", title: "Dinner", note: "One\nTwo" };

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
it("bounds date queries to the exact requested month, including leap years", () => {
  expect(
    calendarRangeSchema.parse({ householdId, month: "2024-02-17" }),
  ).toMatchObject({ startOn: "2024-02-01", endOn: "2024-02-29" });
});
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
      "2026-11-01",
      "2026-11-30",
    ]) {
      expect(filter).toContain(value);
    }
    expect(q.orderBy).toEqual([
      ["day", "asc"],
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
