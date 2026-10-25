import {
  type WorkoutExercise,
  type WorkoutPlan,
  workoutPlanSchema,
} from "@home-hub/shared/workouts";
import {
  Button,
  Field,
  FieldControl as Input,
  FieldTextarea as Textarea,
} from "@home-hub/ui-web";
import { useState } from "react";

function newExercise(): WorkoutExercise {
  return {
    id: crypto.randomUUID(),
    name: "New exercise",
    pair: 1,
    sets: 2,
    min: 8,
    max: 12,
    unit: "reps",
    unilateral: false,
    load: "per-hand",
    cues: "",
  };
}
export function PlanEditor({
  initial,
  initialTitle,
  disabled,
  onSave,
  onCancel,
}: {
  initial: WorkoutPlan;
  initialTitle: string;
  disabled: boolean;
  onSave: (title: string, plan: WorkoutPlan) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [plan, setPlan] = useState<WorkoutPlan>(() => structuredClone(initial));
  const [error, setError] = useState("");
  function patchExercise(
    wi: number,
    ei: number,
    patch: Partial<WorkoutExercise>,
  ) {
    setPlan((p) => ({
      ...p,
      workouts: p.workouts.map((w, i) =>
        i !== wi
          ? w
          : {
              ...w,
              exercises: w.exercises.map((e, j) =>
                j === ei ? { ...e, ...patch } : e,
              ),
            },
      ),
    }));
  }
  return (
    <form
      className="grid gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const parsed = workoutPlanSchema.safeParse(plan);
        if (!title.trim() || title.trim().length > 150 || !parsed.success) {
          setError(
            parsed.success
              ? "Enter a title (1–150 characters)."
              : parsed.error.issues
                  .map((i) => `${i.path.join(".")}: ${i.message}`)
                  .join("; "),
          );
          return;
        }
        if (await onSave(title.trim(), parsed.data)) onCancel();
      }}
    >
      <h2 className="text-lg font-semibold">Edit shared plan</h2>
      <p className="text-sm text-muted">
        Changes affect future sessions, not existing logs. Household members can
        edit this plan.
      </p>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <fieldset disabled={disabled} className="grid gap-4">
        <Field className="grid gap-1" label={<>Plan title</>}>
          <Input
            value={title}
            maxLength={150}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </Field>
        {(["warmup", "finish", "guidance"] as const).map((key) => (
          <Field key={key} className="grid gap-1 capitalize" label={key}>
            <Textarea
              value={plan[key]}
              maxLength={8000}
              onChange={(e) =>
                setPlan((p) => ({ ...p, [key]: e.target.value }))
              }
            />
          </Field>
        ))}
        <Field
          className="grid gap-1"
          label={<>Smallest available increase (kg, optional)</>}
        >
          <Input
            type="number"
            step="0.25"
            min="0.01"
            max="100"
            value={plan.incrementKg ?? ""}
            onChange={(e) =>
              setPlan((p) => ({
                ...p,
                incrementKg: e.target.value ? Number(e.target.value) : null,
              }))
            }
          />
        </Field>
        {plan.workouts.map((workout, wi) => (
          <section
            key={workout.id}
            className="grid gap-3 rounded-lg border border-border p-4"
          >
            <Field className="grid gap-1" label={<>Workout name</>}>
              <Input
                value={workout.name}
                required
                maxLength={150}
                onChange={(e) =>
                  setPlan((p) => ({
                    ...p,
                    workouts: p.workouts.map((w, i) =>
                      i === wi ? { ...w, name: e.target.value } : w,
                    ),
                  }))
                }
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={wi === 0}
                onClick={() =>
                  setPlan((p) => {
                    const workouts = [...p.workouts];
                    const current = workouts[wi];
                    const before = workouts[wi - 1];
                    if (current && before) {
                      workouts[wi - 1] = current;
                      workouts[wi] = before;
                    }
                    return { ...p, workouts };
                  })
                }
              >
                Move workout earlier
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={plan.workouts.length === 1}
                onClick={() =>
                  setPlan((p) => ({
                    ...p,
                    workouts: p.workouts.filter((_, i) => i !== wi),
                  }))
                }
              >
                Remove workout
              </Button>
            </div>
            {workout.exercises.map((exercise, ei) => (
              <fieldset
                key={exercise.id}
                className="grid gap-3 rounded-md bg-raised p-3"
              >
                <legend className="text-sm font-medium">
                  Exercise {ei + 1}
                </legend>
                <Field className="grid gap-1" label={<>Name</>}>
                  <Input
                    value={exercise.name}
                    required
                    maxLength={150}
                    onChange={(e) =>
                      patchExercise(wi, ei, { name: e.target.value })
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(["pair", "sets", "min", "max"] as const).map((key) => (
                    <Field
                      key={key}
                      className="grid gap-1 capitalize"
                      label={key}
                    >
                      <Input
                        type="number"
                        min="1"
                        max={key === "pair" ? 20 : key === "sets" ? 10 : 600}
                        value={exercise[key]}
                        required
                        onChange={(e) =>
                          patchExercise(wi, ei, {
                            [key]: Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                  ))}
                </div>
                <label className="grid gap-1">
                  Measure
                  <select
                    className="rounded border border-border bg-surface p-2"
                    value={exercise.unit}
                    onChange={(e) =>
                      patchExercise(wi, ei, {
                        unit: e.target.value as WorkoutExercise["unit"],
                      })
                    }
                  >
                    <option value="reps">Repetitions</option>
                    <option value="seconds">Seconds</option>
                  </select>
                </label>
                <label className="grid gap-1">
                  Load convention
                  <select
                    className="rounded border border-border bg-surface p-2"
                    value={exercise.load}
                    onChange={(e) =>
                      patchExercise(wi, ei, {
                        load: e.target.value as WorkoutExercise["load"],
                      })
                    }
                  >
                    <option value="per-hand">kg per hand</option>
                    <option value="single">kg, single dumbbell</option>
                    <option value="bodyweight">Bodyweight</option>
                  </select>
                </label>
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={exercise.unilateral}
                    onChange={(e) =>
                      patchExercise(wi, ei, { unilateral: e.target.checked })
                    }
                  />
                  Each side
                </label>
                <Field className="grid gap-1" label={<>Technique cues</>}>
                  <Textarea
                    value={exercise.cues}
                    maxLength={8000}
                    onChange={(e) =>
                      patchExercise(wi, ei, { cues: e.target.value })
                    }
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={ei === 0}
                    onClick={() =>
                      setPlan((p) => ({
                        ...p,
                        workouts: p.workouts.map((w, i) => {
                          if (i !== wi) return w;
                          const exercises = [...w.exercises];
                          const current = exercises[ei];
                          const before = exercises[ei - 1];
                          if (current && before) {
                            exercises[ei - 1] = current;
                            exercises[ei] = before;
                          }
                          return { ...w, exercises };
                        }),
                      }))
                    }
                  >
                    Move exercise earlier
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={workout.exercises.length === 1}
                    onClick={() =>
                      setPlan((p) => ({
                        ...p,
                        workouts: p.workouts.map((w, i) =>
                          i === wi
                            ? {
                                ...w,
                                exercises: w.exercises.filter(
                                  (_, j) => j !== ei,
                                ),
                              }
                            : w,
                        ),
                      }))
                    }
                  >
                    Remove exercise
                  </Button>
                </div>
              </fieldset>
            ))}
            <Button
              type="button"
              variant="secondary"
              disabled={workout.exercises.length >= 40}
              onClick={() =>
                setPlan((p) => ({
                  ...p,
                  workouts: p.workouts.map((w, i) =>
                    i === wi
                      ? { ...w, exercises: [...w.exercises, newExercise()] }
                      : w,
                  ),
                }))
              }
            >
              Add exercise
            </Button>
          </section>
        ))}
        <Button
          type="button"
          variant="secondary"
          disabled={plan.workouts.length >= 14}
          onClick={() =>
            setPlan((p) => ({
              ...p,
              workouts: [
                ...p.workouts,
                {
                  id: crypto.randomUUID(),
                  name: "New workout",
                  exercises: [newExercise()],
                },
              ],
            }))
          }
        >
          Add workout
        </Button>
        <div className="flex gap-2">
          <Button type="submit">Save plan</Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
