import { expect, it } from "vitest";
import {
  cleanLogNote,
  logEntryWriteSchema,
  logTitleSchema,
  normalizedLogTitle,
} from "./logs";
import { queries } from "./zero/queries";
import { schema } from "./zero/schema.gen";

it("normalizes shared titles and preserves multiline note content", () => {
  expect(normalizedLogTitle(" My   GARDEN ")).toBe("my garden");
  expect(cleanLogNote(" first\r\nsecond ")).toBe(" first\nsecond ");
  expect(cleanLogNote(" \n\t ")).toBe("");
  expect(logTitleSchema.safeParse("   ").success).toBe(false);
});

it("validates genuine calendar dates, revisions, timezone and note bounds", () => {
  const valid = {
    householdId: crypto.randomUUID(),
    logId: crypto.randomUUID(),
    entryId: crypto.randomUUID(),
    writeId: crypto.randomUUID(),
    entryOn: "2026-11-03",
    expectedVersion: null,
    note: "Note",
    timeZone: "Europe/Lisbon",
  };
  expect(logEntryWriteSchema.safeParse(valid).success).toBe(true);

  for (const change of [
    { entryOn: "2026-02-29" },
    { timeZone: "invalid" },
    { note: "x".repeat(20001) },
    { expectedVersion: 0 },
  ]) {
    expect(logEntryWriteSchema.safeParse({ ...valid, ...change }).success).toBe(
      false,
    );
  }
});

it("keeps server retry identifiers unpublished and bounds history with membership/module guards", () => {
  expect(schema.tables.logEntries.columns).not.toHaveProperty("lastWriteId");

  const query = queries.logs.history.fn({
    ctx: { userId: crypto.randomUUID() },
    args: { householdId: crypto.randomUUID(), logId: crypto.randomUUID() },
  });
  const ast = JSON.stringify((query as unknown as { ast: unknown }).ast);
  expect(ast).toContain('"limit":21');
  expect(ast).toContain("members");
  expect(ast).toContain("moduleSettings");
  expect(ast).not.toContain("password");
});
