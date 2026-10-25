import { describe, expect, it } from "vitest";
import { starterWorkoutPlan } from "./workout-seed";
import {
  cycleWeek,
  type LoggedWorkoutSet,
  nextWorkout,
  progressionSuggestion,
  saveWorkoutSetSchema,
  workoutPlanSchema,
  workoutWeekStart,
} from "./workouts";

const exercise = starterWorkoutPlan.workouts[0]?.exercises[0];
if (!exercise) throw new Error("Missing seed");
const sets: LoggedWorkoutSet[] = [1, 2].map((round) => ({
  exerciseId: exercise.id,
  round,
  amount: exercise.max,
  rightAmount: null,
  weightKg: 8,
  goodForm: true,
  rir: 3,
  note: "",
  skipped: false,
}));
describe("workout planning and progression", () => {
  it("ships the complete three-workout, two-set paired program", () => {
    expect(workoutPlanSchema.parse(starterWorkoutPlan)).toEqual(
      starterWorkoutPlan,
    );
    expect(starterWorkoutPlan.workouts.map((w) => w.name)).toEqual([
      "Workout A",
      "Workout B",
      "Workout C",
    ]);
    for (const w of starterWorkoutPlan.workouts) {
      expect(w.exercises).toHaveLength(6);
      expect(w.exercises.map((e) => e.pair)).toEqual([1, 1, 2, 2, 3, 3]);
      expect(w.exercises.every((e) => e.sets === 2)).toBe(true);
    }
    expect(starterWorkoutPlan.guidance).toContain("3–4");
    expect(starterWorkoutPlan.finish).toContain("Kiné");
  });
  it("rotates by workout identity, wraps, and recovers when a workout is removed", () => {
    const [a, b, c] = starterWorkoutPlan.workouts;
    expect(nextWorkout(starterWorkoutPlan)).toEqual(a);
    expect(nextWorkout(starterWorkoutPlan, a?.id)).toEqual(b);
    expect(nextWorkout(starterWorkoutPlan, b?.id)).toEqual(c);
    expect(nextWorkout(starterWorkoutPlan, c?.id)).toEqual(a);
    expect(nextWorkout(starterWorkoutPlan, crypto.randomUUID())).toEqual(a);
  });
  it("rejects duplicate workout/exercise identities and invalid targets", () => {
    const p = structuredClone(starterWorkoutPlan);
    const a = p.workouts[0];
    if (!a) throw new Error("seed");
    p.workouts.push(a);
    expect(workoutPlanSchema.safeParse(p).success).toBe(false);
    p.workouts.pop();
    a.exercises.push(a.exercises[0] as NonNullable<typeof exercise>);
    expect(workoutPlanSchema.safeParse(p).success).toBe(false);
    a.exercises.pop();
    a.exercises[0] = { ...exercise, min: 20, max: 10 };
    expect(workoutPlanSchema.safeParse(p).success).toBe(false);
  });
  it("only suggests an increase with all sets, consistent loads, reserve, and explicit form confirmation", () => {
    expect(progressionSuggestion(exercise, sets, 0.5)).toContain("8.5 kg");
    expect(progressionSuggestion(exercise, sets, null)).toContain(
      "smallest available",
    );
    for (const patch of [
      { goodForm: false },
      { rir: null },
      { rir: 1 },
      { amount: 8 },
      { skipped: true },
    ])
      expect(
        progressionSuggestion(
          exercise,
          sets.map((s) => ({ ...s, ...patch })),
          0.5,
        ),
      ).not.toContain("8.5 kg");
    expect(
      progressionSuggestion(exercise, sets.slice(0, 1), 0.5),
    ).not.toContain("8.5 kg");
    expect(
      progressionSuggestion(
        exercise,
        sets.map((s) => ({ ...s, weightKg: null })),
        0.5,
      ),
    ).not.toContain("kg next");
    expect(
      progressionSuggestion(
        exercise,
        [
          sets[0] as LoggedWorkoutSet,
          { ...(sets[1] as LoggedWorkoutSet), weightKg: 9 },
        ],
        0.5,
      ),
    ).toContain("same comfortable load");
  });
  it("requires both sides and suggests variation instead of weight for timed planks", () => {
    const plank = starterWorkoutPlan.workouts[1]?.exercises[5];
    if (!plank) throw new Error("seed");
    const logs = sets.map((s) => ({
      ...s,
      exerciseId: plank.id,
      amount: 30,
      rightAmount: 30,
      weightKg: null,
    }));
    expect(progressionSuggestion(plank, logs, 1)).toContain("harder variation");
    expect(
      progressionSuggestion(
        plank,
        logs.map((s) => ({ ...s, rightAmount: 15 })),
        1,
      ),
    ).not.toContain("harder variation");
  });
  it("uses date-label arithmetic for Monday weeks and six-week review across DST", () => {
    expect(workoutWeekStart("2026-10-25")).toBe("2026-10-19");
    expect(workoutWeekStart("2026-10-26")).toBe("2026-10-26");
    expect(cycleWeek("2026-10-01", "2026-11-11")).toBe(6);
    expect(cycleWeek("2026-10-01", "2026-11-12")).toBe(7);
  });
  it("validates set values and rejects actor spoofing", () => {
    const args = {
      householdId: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      exerciseId: exercise.id,
      round: 1,
      optimisticTimestamp: 1,
      values: sets[0],
    };
    const values = {
      weightKg: 8,
      amount: 10,
      rightAmount: null,
      rir: 3,
      goodForm: true,
      note: "",
      skipped: false,
    };
    expect(saveWorkoutSetSchema.safeParse({ ...args, values }).success).toBe(
      true,
    );
    expect(
      saveWorkoutSetSchema.safeParse({
        ...args,
        values,
        userId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
    for (const patch of [
      { amount: -1 },
      { amount: 1.5 },
      { weightKg: -1 },
      { rir: 11 },
      { skipped: true, note: "" },
    ])
      expect(
        saveWorkoutSetSchema.safeParse({
          ...args,
          values: { ...values, ...patch },
        }).success,
      ).toBe(false);
    expect(
      saveWorkoutSetSchema.safeParse({
        ...args,
        values: { ...values, amount: 0, skipped: true, note: "Wrist rehab" },
      }).success,
    ).toBe(true);
  });
});
