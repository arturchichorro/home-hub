import { expect, it } from "vitest";
import {
  type ActualSet,
  exerciseStatistics,
  habitStatistics,
} from "./calculate";

const actual: ActualSet = {
  round: 1,
  amount: 8,
  rightAmount: null,
  weightKg: null,
  unit: "reps",
  load: "bodyweight",
  unilateral: false,
};

it("keeps explicit zero separate from historical missing values and does not mix volume conventions", () => {
  const stats = exerciseStatistics();
  stats.add("session", "2026-01-01", {
    ...actual,
    load: "per-hand",
    unilateral: true,
    amount: 0,
    rightAmount: 0,
    weightKg: 0,
  });
  expect(stats.finish()).toMatchObject({
    sessions: 1,
    sets: 1,
    volumeKg: 0,
    unmeasuredSets: 0,
    reps: { total: 0 },
  });
  stats.add("session", "2026-01-01", {
    ...actual,
    load: "single",
    unilateral: true,
    amount: 8,
    rightAmount: null,
    weightKg: 10,
  });
  stats.add("session", "2026-01-01", {
    ...actual,
    load: "single",
    unilateral: true,
    amount: 8,
    rightAmount: 0,
    weightKg: 10,
  });
  stats.add("session", "2026-01-01", {
    ...actual,
    unit: "seconds",
    load: "per-hand",
    amount: 30,
    weightKg: 100,
  });
  stats.add("session", "2026-01-01", {
    ...actual,
    load: "single",
    weightKg: null,
  });
  expect(stats.finish()).toMatchObject({
    sessions: 1,
    sets: 5,
    volumeKg: 240,
    unmeasuredSets: 1,
    reps: { total: 32, left: 16, right: 8 },
    seconds: { total: 30 },
  });
  expect(stats.finish().records).toHaveLength(3);
  expect(exerciseStatistics().finish()).toMatchObject({
    sessions: 0,
    sets: 0,
    volumeKg: null,
    records: [],
  });
});
it("preserves open current weeks, resets after gaps, and never carries activity outside the supplied period", () => {
  const stats = habitStatistics("2027-01-10");
  stats.add("2026-12-21", true);
  stats.add("2026-12-27", true);
  stats.add("2027-01-03", true);
  stats.add("2027-01-09", false);
  expect(stats.finish()).toMatchObject({
    completedDays: 3,
    endingWeeks: 2,
    bestWeeks: 2,
  });
  const afterGap = habitStatistics("2027-01-11");
  afterGap.add("2026-12-14", true);
  afterGap.add("2027-01-03", true);
  expect(afterGap.finish()).toMatchObject({ endingWeeks: 0, bestWeeks: 1 });
});
it.each(["2026-03-08", "2026-11-01", "0001-01-01", "9999-12-31"])(
  "uses literal dates without DST/year-boundary shifts: %s",
  (day) => {
    const stats = habitStatistics(day);
    stats.add(day, true);
    expect(stats.finish()).toMatchObject({
      completedDays: 1,
      lastOn: day,
      last7: 1,
      last30: 1,
      endingWeeks: 1,
      bestWeeks: 1,
    });
  },
);
