import { expect, it } from "vitest";
import { calendarHabitSchema } from "./calendar-habits";
import {
  habitAutomaticallyCompleted,
  habitCalendarCompleted,
  habitCompleted,
} from "./habits";

it("combines independent sources, with an inclusive eligibility instant and no clock-triggered write", () => {
  const entry = {
    completed: false,
    workoutCompleted: false,
    calendarEligibleAt: 1000,
  };
  expect(habitCompleted(entry, 999)).toBe(false);
  expect(habitCalendarCompleted(entry, 1000)).toBe(true);
  expect(habitAutomaticallyCompleted(entry, 1000)).toBe(true);
  expect(habitCompleted(entry, 1000)).toBe(true);
  expect(habitCompleted({ ...entry, completed: true }, 999)).toBe(true);
  expect(habitCompleted({ ...entry, workoutCompleted: true }, 999)).toBe(true);
  expect(habitCompleted({ ...entry, calendarEligibleAt: null }, 2000)).toBe(
    false,
  );
  expect(entry.calendarEligibleAt).toBe(1000);
});
it("does not accept an owner override, arbitrary deadlines or invalid timezones", () => {
  const value = {
    householdId: crypto.randomUUID(),
    itemId: crypto.randomUUID(),
    habitId: crypto.randomUUID(),
    timeZone: "Europe/Brussels",
    optimisticTimestamp: 1,
  };
  expect(calendarHabitSchema.safeParse(value).success).toBe(true);
  expect(
    calendarHabitSchema.safeParse({ ...value, habitId: null }).success,
  ).toBe(true);
  expect(
    calendarHabitSchema.safeParse({ ...value, userId: crypto.randomUUID() })
      .success,
  ).toBe(false);
  expect(
    calendarHabitSchema.safeParse({ ...value, calendarEligibleAt: 1 }).success,
  ).toBe(false);
  expect(
    calendarHabitSchema.safeParse({ ...value, timeZone: "no/such-zone" })
      .success,
  ).toBe(false);
});
