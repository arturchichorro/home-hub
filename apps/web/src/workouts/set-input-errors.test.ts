import type { WorkoutExercise } from "@home-hub/shared/workouts";
import { expect, it } from "vitest";
import { completeSetValues, setInputErrors } from "./workout-log-form";

const exercise: WorkoutExercise = {
  id: crypto.randomUUID(),
  name: "Row",
  sets: 3,
  target: "",
  unit: "reps",
  load: "single",
  unilateral: false,
};
it("distinguishes invalid fractional reps from missing input, without rejecting fractional kg or zero", () => {
  expect(
    setInputErrors(exercise, {
      amount: "12.5",
      weightKg: "12.5",
      rightAmount: "",
    }),
  ).toEqual({ amount: "reps: use a whole number from 0 to 600." });
  expect(
    setInputErrors(exercise, { amount: "", weightKg: "", rightAmount: "" }),
  ).toEqual({});
  expect(
    completeSetValues(exercise, {
      amount: "0",
      weightKg: "0",
      rightAmount: "",
    }),
  ).toEqual({ amount: 0, weightKg: 0, rightAmount: null });
});
it("validates sides independently and ignores inapplicable fields", () => {
  expect(
    setInputErrors(
      { ...exercise, unilateral: true },
      { amount: "12", rightAmount: "12.5", weightKg: "1001" },
    ),
  ).toEqual({
    rightAmount: "Right reps: use a whole number from 0 to 600.",
    weightKg: "Weight must be between 0 and 1000 kg.",
  });
  expect(
    setInputErrors(
      { ...exercise, load: "bodyweight" },
      { amount: "10", weightKg: "ignored", rightAmount: "ignored" },
    ),
  ).toEqual({});
});
it.each(["-1", "601", "Infinity", "NaN"])(
  "explains invalid count %s",
  (amount) => {
    expect(
      setInputErrors(exercise, { amount, weightKg: "12.5", rightAmount: "" })
        .amount,
    ).toBeDefined();
  },
);
