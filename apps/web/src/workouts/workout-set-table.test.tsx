import type { WorkoutExercise } from "@home-hub/shared/workouts";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { ExercisePerformance } from "./training-log-projection";
import { WorkoutExerciseSets, type WorkoutLogging } from "./workout-log";
import { WorkoutLogEditor } from "./workout-log-editor";
import { openWorkoutLog, setInputKey } from "./workout-log-form";

const householdId = crypto.randomUUID();
const exercise: WorkoutExercise = {
  id: crypto.randomUUID(),
  catalogExerciseId: crypto.randomUUID(),
  name: "Dumbbell Romanian deadlift",
  unit: "reps",
  load: "per-hand",
  unilateral: false,
  sets: 2,
  target: "8–12",
};

function fixture(overrides: Partial<WorkoutExercise> = {}) {
  const movement = { ...exercise, ...overrides };
  const form = openWorkoutLog({ title: "Workout", exercises: [movement] });
  const editor = new WorkoutLogEditor(form, {
    householdId,
    workoutId: crypto.randomUUID(),
    timeZone: "UTC",
    enabled: () => true,
    save: async () => true,
    remove: async () => true,
  });
  const previous = new Map<string, ExercisePerformance>();
  const logging: WorkoutLogging = {
    form,
    state: editor.getSnapshot(),
    previous,
    onChange: vi.fn(),
    onFlush: vi.fn(),
    onAddExercise: vi.fn(),
    onAddSet: vi.fn(),
    onRemoveSet: vi.fn(),
  };
  const render = (disabled = false) =>
    renderToStaticMarkup(
      <WorkoutExerciseSets
        exercise={movement}
        logging={logging}
        disabled={disabled}
      />,
    );
  const old = {
    id: crypto.randomUUID(),
    householdId,
    userId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    exerciseId: movement.catalogExerciseId ?? movement.id,
    templateExerciseId: null,
    position: 0,
    name: movement.name,
    unit: movement.unit,
    load: movement.load,
    unilateral: movement.unilateral,
    role: "workout",
    plannedSets: 2,
    target: movement.target,
    performedOn: "2026-11-10",
    performedAt: 1,
    deletedAt: null,
    sets: [] as ExercisePerformance["sets"],
  } satisfies ExercisePerformance;
  return { movement, form, logging, previous, old, render };
}

it.each([
  ["per-hand", "reps", false, "kg/hand", "Reps", 4],
  ["single", "reps", false, "kg", "Reps", 4],
  ["bodyweight", "reps", false, null, "Reps", 2],
  ["bodyweight", "seconds", false, null, "Seconds", 2],
  ["single", "reps", true, "kg", "Reps", 6],
  ["bodyweight", "seconds", true, null, "Seconds", 4],
] as const)(
  "uses one truthful header for %s/%s/side=%s",
  (load, unit, unilateral, weight, measure, inputs) => {
    const { render } = fixture({ load, unit, unilateral });
    const html = render();
    expect(html.match(/<table /g)).toHaveLength(1);
    expect(html.match(new RegExp(`>${measure}<`, "g"))).toHaveLength(1);
    expect(html.match(/<input /g)).toHaveLength(inputs);
    expect(html.match(/<tbody /g)).toHaveLength(2);
    expect(html).not.toContain("Previous</th>");

    if (weight) {
      expect(html.match(new RegExp(`>${weight}<`, "g"))).toHaveLength(1);
    } else {
      expect(html).not.toContain("Weight in kg");
    }

    if (unilateral) {
      expect(html).toContain('scope="colgroup" colSpan="2"');
      expect(html).toContain(">Left<");
      expect(html).toContain(">Right<");
    }
  },
);

it("aligns previous measurements beneath current inputs without filling empty current sets or repeating units", () => {
  const { previous, old, render } = fixture();
  old.sets = [1, 2].map((round) => ({
    sessionExerciseId: old.id,
    round,
    amount: 12,
    weightKg: round === 1 ? 10 : 12.5,
    rightAmount: null,
    unit: "reps",
    load: "per-hand",
    unilateral: false,
  }));
  previous.set(exercise.catalogExerciseId ?? "", old);
  const html = render();
  expect(html.match(/>Previous<\/th>/g)).toHaveLength(2);
  expect(html).toContain("Previous: </span>10</td>");
  expect(html).toContain("Previous: </span>12.5</td>");
  expect(html).toContain("Previous: </span>12</td>");
  expect(html.match(/>kg\/hand</g)).toHaveLength(1);
  expect(html.match(/>Reps</g)).toHaveLength(1);
  expect(html.match(/placeholder="—"/g)).toHaveLength(4);
  expect(html).not.toContain("lucide-history");
  expect(html).toContain("aria-describedby=");
});

it.each([null, 0])(
  "preserves legacy equal-right and explicit zero previous measurements (%s)",
  (rightAmount) => {
    const { previous, old, render } = fixture({
      load: "bodyweight",
      unilateral: true,
    });
    old.sets = [
      {
        sessionExerciseId: old.id,
        round: 1,
        amount: 8,
        rightAmount,
        weightKg: null,
        unit: "reps",
        load: "bodyweight",
        unilateral: true,
      },
    ];
    previous.set(exercise.catalogExerciseId ?? "", old);
    const html = render();
    expect(html).toContain(`Previous: </span>${rightAmount ?? 8}</td>`);
  },
);

it("does not compare previous sets recorded under different conventions", () => {
  const { previous, old, render } = fixture();
  old.sets = [
    {
      sessionExerciseId: old.id,
      round: 1,
      amount: 30,
      rightAmount: null,
      weightKg: 10,
      unit: "seconds",
      load: "single",
      unilateral: false,
    },
  ];
  previous.set(exercise.catalogExerciseId ?? "", old);
  expect(render()).not.toContain(">Previous</th>");
});

it("splits mixed frozen conventions into consecutive tables without reordering or relabeling history", () => {
  const { form, render } = fixture({ sets: 4 });
  form.setDefinitions = {
    [setInputKey(exercise.id, 3)]: {
      unit: "seconds",
      load: "bodyweight",
      unilateral: true,
    },
  };
  const html = render();
  expect(html.match(/<table /g)).toHaveLength(3);
  expect(
    [...html.matchAll(/data-round="(\d+)"/g)].map((match) => match[1]),
  ).toEqual(["1", "2", "3", "4"]);
  expect(html).toContain("Left seconds for Dumbbell Romanian deadlift, set 3");
  expect(html).not.toContain(
    "Weight in kg for Dumbbell Romanian deadlift, set 3",
  );
});

it("keeps validation, saving/errors/retry and disabled controls attached to their set", () => {
  const { form, logging, render } = fixture();
  const key = setInputKey(exercise.id, 1);
  form.inputs[key] = { amount: "601", rightAmount: "", weightKg: "-1" };
  logging.state = {
    ...logging.state,
    dirty: new Set([key]),
    errors: { [key]: "Unable to save set." },
  };
  const html = render(true);
  expect(html).toContain('aria-invalid="true"');
  expect(html).toContain("aria-errormessage=");
  expect(html).toContain("Weight must be between 0 and 1000 kg.");
  expect(html).toContain("Unable to save set.");
  expect(html).toContain("Retry");
  expect(
    [...html.matchAll(/<input [^>]+>/g)].every((match) =>
      match[0].includes('disabled=""'),
    ),
  ).toBe(true);
});
