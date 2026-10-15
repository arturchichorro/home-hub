import { describe, expect, it } from "vitest";
import {
  adjacentHabitMonth,
  calendarDate,
  calendarDateSchema,
  clampHabitMonth,
  createHabitMutationSchema,
  habitMonth,
  habitNameSchema,
  habitsQuerySchema,
  reorderHabitsMutationSchema,
  setHabitCompletedMutationSchema,
  timeZoneSchema,
} from "./habits";

const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const habitId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";

describe("habit calendar", () => {
  it.each([
    ["2026-11-01", "2026-10-15", "2026-10-01"],
    ["2027-01-01", "2026-12-31", "2026-12-01"],
    ["2026-09-30", "2026-10-15", "2026-09-01"],
    ["2026-10-01", "2026-09-30", "2026-09-01"],
  ])("clamps %s to the current month as of %s", (anchor, today, expected) => {
    expect(clampHabitMonth(anchor, today)).toBe(expected);
  });
  it("assigns instants using the device timezone without moving stored dates", () => {
    const now = Date.parse("2026-10-19T00:30:00Z");
    expect(calendarDate(now, "America/New_York")).toBe("2026-10-18");
    expect(calendarDate(now, "Europe/Paris")).toBe("2026-10-19");
  });
  it.each([
    ["2024-02-12", 29],
    ["2026-02-12", 28],
    ["2026-10-12", 31],
    ["2026-04-12", 30],
  ] as const)("shows every day of %s", (date, days) => {
    const period = habitMonth(date);
    expect(period.dates).toHaveLength(days);
    expect(period.startOn).toBe(`${date.slice(0, 7)}-01`);
    expect(new Set(period.dates).size).toBe(days);
  });
  it("navigates months without end-of-month overflow", () => {
    expect(adjacentHabitMonth("2026-01-31", 1)).toBe("2026-02-01");
    expect(adjacentHabitMonth("2026-01-31", -1)).toBe("2025-12-01");
  });
});

describe("habit contracts", () => {
  it("rejects duplicate order IDs and an order missing the moved habit", () => {
    const args = {
      householdId,
      habitId,
      orderedHabitIds: [habitId],
      optimisticTimestamp: 0,
    };
    expect(reorderHabitsMutationSchema.safeParse(args).success).toBe(true);
    expect(
      reorderHabitsMutationSchema.safeParse({
        ...args,
        orderedHabitIds: [habitId, habitId],
      }).success,
    ).toBe(false);
    expect(
      reorderHabitsMutationSchema.safeParse({
        ...args,
        orderedHabitIds: [householdId],
      }).success,
    ).toBe(false);
  });
  it("normalizes names and rejects empty/overlong labels", () => {
    expect(habitNameSchema.parse("  Ｅxercise  daily \n")).toBe(
      "Exercise daily",
    );
    expect(habitNameSchema.safeParse("   ").success).toBe(false);
    expect(habitNameSchema.safeParse("a".repeat(101)).success).toBe(false);
  });
  it.each(["2026-02-29", "2026-04-31", "2026-1-01", "2026-10-12T00:00:00Z"])(
    "rejects invalid calendar date %s",
    (date) => {
      expect(calendarDateSchema.safeParse(date).success).toBe(false);
    },
  );
  it("accepts IANA timezone names, not arbitrary strings", () => {
    expect(timeZoneSchema.safeParse("Europe/Paris").success).toBe(true);
    expect(timeZoneSchema.safeParse("not-a-timezone").success).toBe(false);
  });
  it("prevents supplying a different completion actor", () => {
    const args = {
      householdId,
      habitId,
      completedOn: "2026-10-12",
      completed: true,
      timeZone: "UTC",
      optimisticTimestamp: 0,
    };
    expect(setHabitCompletedMutationSchema.safeParse(args).success).toBe(true);
    expect(
      setHabitCompletedMutationSchema.safeParse({ ...args, userId: habitId })
        .success,
    ).toBe(false);
  });
  it("validates IDs and limits synchronized calendar windows", () => {
    expect(
      createHabitMutationSchema.safeParse({
        householdId: "bad",
        habitId,
        name: "Exercise",
        timeZone: "UTC",
        optimisticTimestamp: 0,
      }).success,
    ).toBe(false);
    const args = {
      householdId,
      startOn: "2026-10-01",
      endOn: "2026-10-31",
      archived: false,
    };
    expect(habitsQuerySchema.safeParse(args).success).toBe(true);
    expect(
      habitsQuerySchema.safeParse({ ...args, endOn: "2026-11-01" }).success,
    ).toBe(false);
    expect(
      habitsQuerySchema.safeParse({ ...args, endOn: "2026-09-30" }).success,
    ).toBe(false);
  });
});
