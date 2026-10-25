import { starterWorkouts } from "@home-hub/shared/workout-seed";
import {
  type WorkoutExercise,
  type WorkoutSetValues,
  workoutContentSchema,
} from "@home-hub/shared/workouts";
import { describe, expect, it } from "vitest";
import { summarizeWorkoutLog } from "./workout-log-summary";

const snapshot = workoutContentSchema.parse(starterWorkouts[0]);
const bench = snapshot.exercises.find((e) => e.name === "Dumbbell bench press");
const row = snapshot.exercises.find(
  (e) => e.name === "Bench-supported one-arm row",
);
if (!bench || !row) throw new Error("seed");
const values: WorkoutSetValues = { amount: 10, rightAmount: null, weightKg: 8 };
function log(
  exercise: WorkoutExercise,
  sets: { round: number; values: WorkoutSetValues }[],
) {
  return {
    snapshot: { title: "Earlier workout", notes: "", exercises: [exercise] },
    sets: sets.map((s) => ({ logId: "log", exerciseId: exercise.id, ...s })),
  };
}
describe("workout history summaries", () => {
  it("does not invent sets or repetitions from workout targets", () => {
    expect(summarizeWorkoutLog(log(bench, []))).toEqual([]);
  });
  it("shows recorded repetitions and weight rather than targets", () => {
    const summary = summarizeWorkoutLog(
      log(bench, [{ round: 1, values: { ...values, amount: 9 } }]),
    );
    expect(summary).toEqual([
      { id: bench.id, name: bench.name, details: "9 reps · 8 kg/hand" },
    ]);
  });
  it("condenses matching sets", () => {
    expect(
      summarizeWorkoutLog(
        log(bench, [
          { round: 1, values },
          { round: 2, values },
        ]),
      )[0]?.details,
    ).toBe("2 × 10 reps · 8 kg/hand");
  });
  it("preserves individual set numbers, repetitions and loads when they differ", () => {
    const summary = summarizeWorkoutLog(
      log(bench, [
        { round: 2, values: { ...values, amount: 8 } },
        { round: 1, values: { ...values, weightKg: 6 } },
      ]),
    );
    expect(summary[0]?.details).toBe(
      "Set 1: 10 reps · 6 kg/hand; Set 2: 8 reps · 8 kg/hand",
    );
  });
  it("shows both sides and a single dumbbell's weight", () => {
    expect(
      summarizeWorkoutLog(
        log(row, [
          { round: 1, values: { amount: 8, rightAmount: 7, weightKg: 10 } },
        ]),
      )[0]?.details,
    ).toBe("Left 8 / Right 7 reps · 10 kg");
    expect(
      summarizeWorkoutLog(
        log(row, [
          { round: 1, values: { amount: 8, rightAmount: null, weightKg: 10 } },
        ]),
      )[0]?.details,
    ).toContain("Left 8 / Right 8");
  });
  it("supports timed bodyweight sets", () => {
    const plank = workoutContentSchema
      .parse(starterWorkouts[1])
      .exercises.find((e) => e.name === "Forearm side plank");
    if (!plank) throw new Error("seed");
    expect(
      summarizeWorkoutLog(
        log(plank, [
          { round: 1, values: { amount: 20, rightAmount: 15, weightKg: null } },
        ]),
      )[0]?.details,
    ).toBe("Left 20 / Right 15 seconds · bodyweight");
  });
  it("does not hide zero values or guess missing weights", () => {
    expect(
      summarizeWorkoutLog(
        log(bench, [
          { round: 1, values: { amount: 0, rightAmount: null, weightKg: 0 } },
        ]),
      )[0]?.details,
    ).toBe("0 reps · 0 kg/hand");
    expect(
      summarizeWorkoutLog(
        log(bench, [{ round: 1, values: { ...values, weightKg: null } }]),
      )[0]?.details,
    ).toBe("10 reps");
  });
  it("uses the historical exercise name", () => {
    expect(
      summarizeWorkoutLog(
        log({ ...bench, name: "Original press" }, [{ round: 1, values }]),
      )[0]?.name,
    ).toBe("Original press");
  });
});
