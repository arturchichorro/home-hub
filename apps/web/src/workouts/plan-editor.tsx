import {
  type WorkoutExercise,
  type WorkoutPlan,
  workoutPlanSchema,
} from "@home-hub/shared/workouts";
import {
  ArrowUp,
  Button,
  Check,
  ConfirmationPopover,
  IconButton,
  InlineAlert,
  Input,
  Plus,
  Settings,
  Textarea,
  Trash2,
  X,
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
function moveEarlier<T>(rows: T[], index: number): T[] {
  const next = [...rows];
  const current = next[index];
  const before = next[index - 1];
  if (current && before) {
    next[index - 1] = current;
    next[index] = before;
  }
  return next;
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
      className="grid min-w-0 gap-6"
      onSubmit={async (event) => {
        event.preventDefault();
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
      <div className="flex min-w-0 items-center gap-2">
        <Input
          appearance="seamless"
          aria-label="Plan title"
          className="min-w-0 flex-1 text-2xl font-semibold text-primary"
          value={title}
          disabled={disabled}
          maxLength={150}
          onValueChange={setTitle}
          required
        />
        <IconButton
          type="submit"
          aria-label="Save plan"
          title="Save plan"
          className="text-primary"
          disabled={disabled}
        >
          <Check aria-hidden="true" className="size-4" />
        </IconButton>
        <IconButton
          aria-label="Cancel plan editing"
          title="Cancel"
          disabled={disabled}
          onClick={onCancel}
        >
          <X aria-hidden="true" className="size-4" />
        </IconButton>
      </div>
      {error && (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      )}
      <p className="text-xs text-muted">
        Shared plan · Changes apply to future sessions. Save when you're done.
      </p>
      <fieldset disabled={disabled} className="grid min-w-0 gap-6">
        {plan.workouts.map((workout, wi) => (
          <section key={workout.id} className="grid min-w-0 gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Input
                appearance="seamless"
                aria-label={`Workout ${wi + 1} name`}
                className="min-w-0 flex-1 text-lg font-semibold text-primary"
                value={workout.name}
                required
                maxLength={150}
                onValueChange={(name) =>
                  setPlan((p) => ({
                    ...p,
                    workouts: p.workouts.map((w, i) =>
                      i === wi ? { ...w, name } : w,
                    ),
                  }))
                }
              />
              <IconButton
                className="size-7!"
                aria-label={`Move ${workout.name} earlier`}
                title="Move workout earlier"
                disabled={disabled || wi === 0}
                onClick={() =>
                  setPlan((p) => ({
                    ...p,
                    workouts: moveEarlier(p.workouts, wi),
                  }))
                }
              >
                <ArrowUp aria-hidden="true" className="size-4" />
              </IconButton>
              <ConfirmationPopover
                message={`Remove ${workout.name} from this plan? Existing logs are kept.`}
                trigger={
                  <IconButton
                    className="size-7!"
                    aria-label={`Remove ${workout.name}`}
                    title="Remove workout"
                    disabled={disabled || plan.workouts.length === 1}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </IconButton>
                }
                onConfirm={() =>
                  setPlan((p) => ({
                    ...p,
                    workouts: p.workouts.filter((_, i) => i !== wi),
                  }))
                }
              />
            </div>
            <div className="divide-y divide-border">
              {workout.exercises.map((exercise, ei) => (
                <div key={exercise.id} className="grid min-w-0 gap-1 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Input
                      appearance="seamless"
                      aria-label={`Exercise ${ei + 1} name in ${workout.name}`}
                      className="min-w-0 flex-1 font-medium"
                      value={exercise.name}
                      required
                      maxLength={150}
                      onValueChange={(name) => patchExercise(wi, ei, { name })}
                    />
                    <IconButton
                      className="size-7!"
                      aria-label={`Move ${exercise.name} earlier in ${workout.name}`}
                      title="Move exercise earlier"
                      disabled={disabled || ei === 0}
                      onClick={() =>
                        setPlan((p) => ({
                          ...p,
                          workouts: p.workouts.map((w, i) =>
                            i === wi
                              ? {
                                  ...w,
                                  exercises: moveEarlier(w.exercises, ei),
                                }
                              : w,
                          ),
                        }))
                      }
                    >
                      <ArrowUp aria-hidden="true" className="size-4" />
                    </IconButton>
                    <ConfirmationPopover
                      message={`Remove ${exercise.name}?`}
                      trigger={
                        <IconButton
                          className="size-7!"
                          aria-label={`Remove ${exercise.name} from ${workout.name}`}
                          title="Remove exercise"
                          disabled={disabled || workout.exercises.length === 1}
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                        </IconButton>
                      }
                      onConfirm={() =>
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
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    {(["pair", "sets", "min", "max"] as const).map((key) => (
                      <div key={key} className="flex items-center gap-1">
                        <span className="capitalize">
                          {key === "min" ? "From" : key === "max" ? "To" : key}
                        </span>
                        <Input
                          appearance="seamless"
                          aria-label={`${exercise.name} ${key} in ${workout.name}`}
                          className="h-7! w-12 flex-none! text-xs tabular-nums"
                          type="number"
                          min="1"
                          max={key === "pair" ? 20 : key === "sets" ? 10 : 600}
                          required
                          value={exercise[key] || ""}
                          onValueChange={(value) =>
                            patchExercise(wi, ei, { [key]: Number(value) })
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <details className="group/options min-w-0">
                    <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-xs text-muted outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
                      <Settings aria-hidden="true" className="size-3.5" />
                      Technique & options
                    </summary>
                    <div className="grid gap-2 pb-2">
                      <Textarea
                        appearance="seamless"
                        aria-label={`Technique cues for ${exercise.name} in ${workout.name}`}
                        rows={1}
                        placeholder="Add technique cues…"
                        value={exercise.cues}
                        maxLength={8000}
                        onChange={(e) =>
                          patchExercise(wi, ei, { cues: e.target.value })
                        }
                      />
                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
                        <label className="flex items-center gap-2">
                          Measure
                          <select
                            className="min-h-8 bg-transparent text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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
                        <label className="flex items-center gap-2">
                          Load convention
                          <select
                            className="min-h-8 bg-transparent text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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
                        <label className="flex min-h-8 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={exercise.unilateral}
                            onChange={(e) =>
                              patchExercise(wi, ei, {
                                unilateral: e.target.checked,
                              })
                            }
                          />
                          Each side
                        </label>
                      </div>
                    </div>
                  </details>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              className="h-8! justify-start! px-1! font-normal text-muted"
              disabled={disabled || workout.exercises.length >= 40}
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
              <Plus aria-hidden="true" className="size-4" />
              Add exercise
            </Button>
          </section>
        ))}
        <Button
          type="button"
          variant="ghost"
          className="h-8! justify-start! px-1! font-normal text-muted"
          disabled={disabled || plan.workouts.length >= 14}
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
          <Plus aria-hidden="true" className="size-4" />
          Add workout
        </Button>
        <section className="grid gap-2 border-t border-border pt-4">
          <h2 className="text-sm font-semibold">Program instructions</h2>
          {(["warmup", "finish", "guidance"] as const).map((key) => (
            <details key={key}>
              <summary className="cursor-pointer py-2 text-sm text-muted">
                {key === "warmup"
                  ? "Warm-up"
                  : key === "finish"
                    ? "Mobility & finish"
                    : "Schedule & guidance"}
              </summary>
              <Textarea
                appearance="seamless"
                aria-label={`Plan ${key}`}
                rows={1}
                value={plan[key]}
                maxLength={8000}
                placeholder="Add instructions…"
                onChange={(e) =>
                  setPlan((p) => ({ ...p, [key]: e.target.value }))
                }
              />
            </details>
          ))}
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>Smallest available increase</span>
            <Input
              appearance="seamless"
              aria-label="Smallest available increase in kg"
              className="h-8! w-20 flex-none! text-sm"
              type="number"
              step="0.01"
              min="0.01"
              max="100"
              placeholder="Optional"
              value={plan.incrementKg ?? ""}
              onValueChange={(value) =>
                setPlan((p) => ({
                  ...p,
                  incrementKg: value ? Number(value) : null,
                }))
              }
            />
            <span>kg</span>
          </div>
        </section>
      </fieldset>
    </form>
  );
}
