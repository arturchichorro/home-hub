import type {
  RemoveExerciseSet,
  SaveExerciseSet,
} from "@home-hub/shared/exercise-logs";
import { calendarDate } from "@home-hub/shared/habits";
import type { WorkoutExercise } from "@home-hub/shared/workouts";
import type { WorkoutLog } from "./workout-log";
import {
  completeSetValues,
  exerciseRoundCount,
  exerciseRounds,
  nextExerciseRound,
  openWorkoutLog,
  setInputKey,
  type WorkoutLogForm,
  type WorkoutSetInput,
} from "./workout-log-form";

const blank = (): WorkoutSetInput => ({
  weightKg: "",
  amount: "",
  rightAmount: "",
});
const fingerprint = (input: WorkoutSetInput | undefined) =>
  JSON.stringify(input ?? blank());
type Options = {
  householdId: string;
  workoutId: string;
  timeZone: string;
  enabled: () => boolean;
  save: (args: SaveExerciseSet) => Promise<boolean>;
  remove: (args: RemoveExerciseSet) => Promise<boolean>;
};
export type WorkoutEditorState = {
  form: WorkoutLogForm;
  errors: Readonly<Record<string, string>>;
  saving: ReadonlySet<string>;
  dirty: ReadonlySet<string>;
  recorded: ReadonlySet<string>;
  headerConfirmed: boolean;
  deleting: ReadonlySet<string>;
  hasChanges: boolean;
};
export class WorkoutLogEditor {
  private form: WorkoutLogForm;
  private readonly saved = new Map<string, WorkoutSetInput>();
  private readonly dirty = new Set<string>();
  private readonly queued = new Set<string>();
  private readonly deleting = new Set<string>();
  private readonly errors: Record<string, string> = {};
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly listeners = new Set<() => void>();
  private chain: Promise<void> = Promise.resolve();
  private disposed = false;
  private headerConfirmed: boolean;
  private state: WorkoutEditorState;
  private readonly options: Options;
  constructor(form: WorkoutLogForm, options: Options) {
    this.form = form;
    this.options = options;
    this.headerConfirmed = form.completedAt !== null;
    for (const [key, input] of Object.entries(form.inputs))
      this.saved.set(key, { ...input });
    this.state = this.snapshot();
  }
  private snapshot(): WorkoutEditorState {
    return {
      form: this.form,
      errors: { ...this.errors },
      saving: new Set(this.queued),
      dirty: new Set(this.dirty),
      recorded: new Set(this.saved.keys()),
      headerConfirmed: this.headerConfirmed,
      deleting: new Set(this.deleting),
      hasChanges: !!(this.dirty.size || this.queued.size || this.deleting.size),
    };
  }
  private emit() {
    this.state = this.snapshot();
    for (const listener of this.listeners) listener();
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  private cancel(key: string) {
    const timer = this.timers.get(key);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(key);
  }
  change = (id: string, round: number, patch: Partial<WorkoutSetInput>) => {
    if (this.disposed) return;
    const key = setInputKey(id, round),
      input = { ...blank(), ...this.form.inputs[key], ...patch };
    this.form = { ...this.form, inputs: { ...this.form.inputs, [key]: input } };
    this.cancel(key);
    delete this.errors[key];
    if (fingerprint(input) === fingerprint(this.saved.get(key)))
      this.dirty.delete(key);
    else this.dirty.add(key);
    const exercise = this.form.snapshot.exercises.find((e) => e.id === id);
    if (exercise && this.dirty.has(key) && completeSetValues(exercise, input))
      this.timers.set(
        key,
        setTimeout(() => {
          void this.flush(id, round);
        }, 600),
      );
    this.emit();
  };
  flush = (id?: string, round?: number): Promise<void> => {
    const exercises = id
      ? this.form.snapshot.exercises.filter((e) => e.id === id)
      : this.form.snapshot.exercises;
    for (const exercise of exercises)
      for (
        let n = 1;
        n <= exerciseRoundCount(exercise, this.form.inputs);
        n++
      ) {
        if (round !== undefined && n !== round) continue;
        const key = setInputKey(exercise.id, n);
        this.cancel(key);
        if (
          !this.dirty.has(key) ||
          this.queued.has(key) ||
          this.deleting.has(key) ||
          !completeSetValues(exercise, this.form.inputs[key])
        )
          continue;
        this.queued.add(key);
        this.chain = this.chain
          .catch(() => {})
          .then(() => this.drain(exercise, n))
          .finally(() => {
            this.queued.delete(key);
            this.emit();
          });
      }
    this.emit();
    return this.chain;
  };
  private async drain(exercise: WorkoutExercise, round: number) {
    const key = setInputKey(exercise.id, round);
    while (this.dirty.has(key) && this.options.enabled()) {
      const input = { ...blank(), ...this.form.inputs[key] },
        values = completeSetValues(exercise, input);
      if (!values) break;
      if (this.form.completedAt === null) {
        const at = Date.now();
        this.form = {
          ...this.form,
          completedAt: at,
          completedOn: calendarDate(at, this.options.timeZone),
        };
      }
      const exerciseLogId =
        this.form.exerciseLogIds?.[exercise.id] ?? crypto.randomUUID();
      this.form = {
        ...this.form,
        exerciseLogIds: {
          ...this.form.exerciseLogIds,
          [exercise.id]: exerciseLogId,
        },
      };
      // Publish the chosen day before Zero can emit an optimistic/remote header.
      this.emit();
      const performedAt = this.form.completedAt ?? Date.now();
      let success = false;
      try {
        success = await this.options.save({
          householdId: this.options.householdId,
          workoutId: this.options.workoutId,
          logId: this.form.id,
          workoutExerciseId: exercise.id,
          exerciseLogId,
          round,
          values,
          snapshot: this.form.snapshot,
          completedOn:
            this.form.completedOn ??
            calendarDate(performedAt, this.options.timeZone),
          optimisticTimestamp: performedAt,
          timeZone: this.options.timeZone,
        });
      } catch {}
      if (!success) {
        this.errors[key] = "Unable to save this set. Your input is still here.";
        this.emit();
        break;
      }
      this.headerConfirmed = true;
      this.saved.set(key, input);
      delete this.errors[key];
      if (fingerprint(this.form.inputs[key]) === fingerprint(input))
        this.dirty.delete(key);
      else this.dirty.add(key);
      this.emit();
    }
  }
  addSet = (id: string) => {
    const exercise = this.form.snapshot.exercises.find((e) => e.id === id);
    if (!exercise) return;
    const nextRound = nextExerciseRound(exercise, this.form.inputs);
    if (
      nextRound === undefined ||
      !exerciseRounds(exercise, this.form.inputs)
        .map((round) =>
          completeSetValues(exercise, this.form.inputs[setInputKey(id, round)]),
        )
        .every(Boolean)
    )
      return;
    this.form = {
      ...this.form,
      inputs: { ...this.form.inputs, [setInputKey(id, nextRound)]: blank() },
    };
    this.emit();
  };
  removeSet = async (id: string, round: number) => {
    const key = setInputKey(id, round);
    this.cancel(key);
    if (this.deleting.has(key)) return;
    if (!this.saved.has(key) && !this.queued.has(key)) {
      this.clearRow(id, round);
      return;
    }
    this.deleting.add(key);
    this.emit();
    const removal = this.chain
      .catch(() => {})
      .then(async () => {
        let success = false;
        try {
          success = await this.options.remove({
            householdId: this.options.householdId,
            workoutId: this.options.workoutId,
            logId: this.form.id,
            workoutExerciseId: id,
            round,
            ...(this.form.completedOn
              ? { completedOn: this.form.completedOn }
              : {}),
          });
        } catch {}
        if (success) this.clearRow(id, round);
        else {
          this.errors[key] = "Unable to remove this set.";
          this.emit();
        }
      })
      .finally(() => {
        this.deleting.delete(key);
        this.emit();
      });
    this.chain = removal;
    await removal;
  };
  private clearRow(id: string, round: number) {
    const key = setInputKey(id, round),
      inputs = { ...this.form.inputs };
    delete inputs[key];
    this.saved.delete(key);
    this.dirty.delete(key);
    delete this.errors[key];
    this.form = { ...this.form, inputs };
    this.emit();
  }
  sync(log: WorkoutLog) {
    let changed =
      this.form.id !== log.id || this.form.completedAt !== log.completedAt;
    if (!this.headerConfirmed && !this.queued.size) {
      this.headerConfirmed = true;
      changed = true;
    }
    for (const [id, value] of Object.entries(log.exerciseLogIds ?? {}))
      if (this.form.exerciseLogIds?.[id] !== value) changed = true;
    const remote = openWorkoutLog(this.form.snapshot, log),
      inputs = { ...this.form.inputs };
    for (const key of new Set([
      ...Object.keys(inputs),
      ...Object.keys(remote.inputs),
    ])) {
      if (this.dirty.has(key) || this.queued.has(key) || this.deleting.has(key))
        continue;
      const next = remote.inputs[key],
        current = inputs[key];
      const id = key.slice(0, key.lastIndexOf(":")),
        exercise = this.form.snapshot.exercises.find((e) => e.id === id);
      if (fingerprint(next) === fingerprint(current)) continue;
      if (
        exercise &&
        next &&
        current &&
        completeSetValues(exercise, next) !== undefined &&
        JSON.stringify(completeSetValues(exercise, next)) ===
          JSON.stringify(completeSetValues(exercise, current))
      )
        continue;
      if (next) inputs[key] = next;
      else delete inputs[key];
      if (next) this.saved.set(key, { ...next });
      else this.saved.delete(key);
      changed = true;
    }
    if (changed) {
      this.form = {
        ...this.form,
        id: log.id,
        completedAt: log.completedAt,
        completedOn: log.completedOn,
        exerciseLogIds: { ...this.form.exerciseLogIds, ...log.exerciseLogIds },
        inputs,
      };
      this.emit();
    }
  }
  dispose() {
    this.disposed = true;
    for (const key of this.timers.keys()) this.cancel(key);
    this.listeners.clear();
  }
}
