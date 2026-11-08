import { calendarDate } from "@home-hub/shared/habits";
import type { SaveTrainingSet } from "@home-hub/shared/training";
import { logOnlyWorkoutExercise } from "@home-hub/shared/training";
import type {
  CatalogExercise,
  WorkoutExercise,
} from "@home-hub/shared/workouts";
import type { WorkoutLog } from "./workout-log";
import {
  completeSetValues,
  exerciseForSet,
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

type Options<Scope extends string | null> = {
  householdId: string;
  workoutId: Scope;
  timeZone: string;
  enabled: () => boolean;
  save: (
    args: Omit<SaveTrainingSet, "workoutId"> & { workoutId: Scope },
  ) => Promise<boolean>;
  remove: (args: {
    householdId: string;
    logId: string;
    sessionExerciseId: string;
    round: number;
  }) => Promise<boolean>;
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

export class WorkoutLogEditor<Scope extends string | null = string> {
  private form: WorkoutLogForm;
  private readonly saved = new Map<string, WorkoutSetInput>();
  private readonly dirty = new Set<string>();
  private readonly unsavedExercises = new Set<string>();
  private readonly queued = new Set<string>();
  private readonly deleting = new Set<string>();
  private readonly errors: Record<string, string> = {};
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly listeners = new Set<() => void>();
  private chain: Promise<void> = Promise.resolve();
  private disposed = false;
  private headerConfirmed: boolean;
  private state: WorkoutEditorState;
  private readonly options: Options<Scope>;

  constructor(form: WorkoutLogForm, options: Options<NoInfer<Scope>>) {
    this.form = form;
    this.options = options;
    this.headerConfirmed = form.completedAt !== null;

    for (const [key, input] of Object.entries(form.inputs)) {
      this.saved.set(key, { ...input });
    }

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
      hasChanges: !!(
        this.dirty.size ||
        this.queued.size ||
        this.deleting.size ||
        this.unsavedExercises.size
      ),
    };
  }

  private emit() {
    this.state = this.snapshot();

    for (const listener of this.listeners) {
      listener();
    }
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

    if (timer !== undefined) {
      clearTimeout(timer);
    }

    this.timers.delete(key);
  }

  change = (id: string, round: number, patch: Partial<WorkoutSetInput>) => {
    if (this.disposed) {
      return;
    }

    const key = setInputKey(id, round);
    const input = { ...blank(), ...this.form.inputs[key], ...patch };
    this.form = { ...this.form, inputs: { ...this.form.inputs, [key]: input } };
    this.cancel(key);
    delete this.errors[key];

    if (fingerprint(input) === fingerprint(this.saved.get(key))) {
      this.dirty.delete(key);
    } else {
      this.dirty.add(key);
    }

    const exercise = this.form.snapshot.exercises.find((e) => e.id === id);

    if (
      exercise &&
      this.dirty.has(key) &&
      completeSetValues(exerciseForSet(exercise, this.form, round), input)
    ) {
      this.timers.set(
        key,
        setTimeout(() => {
          void this.flush(id, round);
        }, 600),
      );
    }

    this.emit();
  };

  flush = (id?: string, round?: number): Promise<void> => {
    const exercises = id
      ? this.form.snapshot.exercises.filter((e) => e.id === id)
      : this.form.snapshot.exercises;

    for (const exercise of exercises) {
      for (
        let n = 1;
        n <= exerciseRoundCount(exercise, this.form.inputs);
        n++
      ) {
        if (round !== undefined && n !== round) {
          continue;
        }

        const key = setInputKey(exercise.id, n);
        this.cancel(key);

        if (
          !this.dirty.has(key) ||
          this.queued.has(key) ||
          this.deleting.has(key) ||
          !completeSetValues(
            exerciseForSet(exercise, this.form, n),
            this.form.inputs[key],
          )
        ) {
          continue;
        }

        this.queued.add(key);
        this.chain = this.chain
          .catch(() => {})
          .then(() => this.drain(exerciseForSet(exercise, this.form, n), n))
          .finally(() => {
            this.queued.delete(key);
            this.emit();
          });
      }
    }

    this.emit();

    return this.chain;
  };

  private async drain(exercise: WorkoutExercise, round: number) {
    const key = setInputKey(exercise.id, round);

    while (!this.disposed && this.dirty.has(key) && this.options.enabled()) {
      const input = { ...blank(), ...this.form.inputs[key] };
      const values = completeSetValues(exercise, input);

      if (!values) {
        break;
      }

      if (this.form.completedAt === null) {
        const at = Date.now();
        this.form = {
          ...this.form,
          completedAt: at,
          completedOn: calendarDate(at, this.options.timeZone),
        };
      }

      const sessionExerciseId =
        this.form.sessionExerciseIds?.[exercise.id] ?? crypto.randomUUID();
      this.form = {
        ...this.form,
        sessionExerciseIds: {
          ...this.form.sessionExerciseIds,
          [exercise.id]: sessionExerciseId,
        },
      };
      // Publish the chosen day before Zero can emit an optimistic/remote header.
      this.emit();

      const savingForm = this.form;
      const newExerciseIds = [...this.unsavedExercises];
      const persistedRows = savingForm.snapshot.exercises.filter(
        (row) =>
          this.options.workoutId === null ||
          !savingForm.logOnlyExerciseIds?.includes(row.id) ||
          !newExerciseIds.includes(row.id) ||
          row.id === exercise.id,
      );
      const performedAt = this.form.completedAt ?? Date.now();
      let success = false;

      try {
        success = await this.options.save({
          householdId: this.options.householdId,
          workoutId: this.options.workoutId,
          logId: savingForm.id,
          completedOn:
            savingForm.completedOn ??
            calendarDate(performedAt, this.options.timeZone),
          optimisticTimestamp: performedAt,
          timeZone: this.options.timeZone,
          name: savingForm.snapshot.title,
          note: "",
          sessionExerciseId: sessionExerciseId,
          round,
          values,
          exercises: persistedRows.map((row) => ({
            id: savingForm.sessionExerciseIds?.[row.id] ?? crypto.randomUUID(),
            catalogExerciseId: row.catalogExerciseId ?? row.id,
            templateExerciseId: savingForm.logOnlyExerciseIds?.includes(row.id)
              ? null
              : row.id,
            unit: row.id === exercise.id ? exercise.unit : row.unit,
            load: row.id === exercise.id ? exercise.load : row.load,
            unilateral:
              row.id === exercise.id ? exercise.unilateral : row.unilateral,
            isNew: !this.headerConfirmed || newExerciseIds.includes(row.id),
          })),
        });
      } catch {}

      if (!success) {
        if (!this.headerConfirmed) {
          this.form = { ...this.form, completedAt: null, completedOn: null };
        }
        this.errors[key] = "Unable to save this set. Your input is still here.";
        this.emit();
        break;
      }

      this.headerConfirmed = true;
      for (const row of persistedRows) {
        this.unsavedExercises.delete(row.id);
      }
      this.saved.set(key, input);
      delete this.errors[key];

      if (fingerprint(this.form.inputs[key]) === fingerprint(input)) {
        this.dirty.delete(key);
      } else {
        this.dirty.add(key);
      }

      this.emit();
    }
  }

  addExercise = (catalog: CatalogExercise) => {
    if (
      this.disposed ||
      !this.options.enabled() ||
      this.form.snapshot.exercises.length >= 40 ||
      this.form.snapshot.exercises.some(
        (row) => row.catalogExerciseId === catalog.id || row.id === catalog.id,
      )
    ) {
      return;
    }

    const exercise = logOnlyWorkoutExercise(catalog);
    this.form = {
      ...this.form,
      snapshot: {
        ...this.form.snapshot,
        exercises: [...this.form.snapshot.exercises, exercise],
      },
      logOnlyExerciseIds: [
        ...(this.form.logOnlyExerciseIds ?? []),
        exercise.id,
      ],
      sessionExerciseIds: {
        ...this.form.sessionExerciseIds,
        [exercise.id]: crypto.randomUUID(),
      },
    };
    this.unsavedExercises.add(exercise.id);
    this.emit();
  };

  discardExercise = (id: string) => {
    if (this.disposed || this.queued.size || this.deleting.size) {
      return false;
    }
    const inputs = { ...this.form.inputs };
    for (const key of Object.keys(inputs)) {
      if (key.startsWith(`${id}:`)) {
        this.cancel(key);
        delete inputs[key];
        this.dirty.delete(key);
        this.saved.delete(key);
        delete this.errors[key];
      }
    }
    const setDefinitions = Object.fromEntries(
      Object.entries(this.form.setDefinitions ?? {}).filter(
        ([key]) => !key.startsWith(`${id}:`),
      ),
    );
    const sessionExerciseIds = { ...this.form.sessionExerciseIds };
    delete sessionExerciseIds[id];
    this.unsavedExercises.delete(id);
    this.form = {
      ...this.form,
      inputs,
      setDefinitions,
      sessionExerciseIds,
      snapshot: {
        ...this.form.snapshot,
        exercises: this.form.snapshot.exercises.filter((row) => row.id !== id),
      },
      logOnlyExerciseIds: (this.form.logOnlyExerciseIds ?? []).filter(
        (value) => value !== id,
      ),
    };
    this.emit();
    return true;
  };

  addSet = (id: string) => {
    const exercise = this.form.snapshot.exercises.find((e) => e.id === id);

    if (!exercise) {
      return;
    }

    const nextRound = nextExerciseRound(exercise, this.form.inputs);

    if (
      nextRound === undefined ||
      !exerciseRounds(exercise, this.form.inputs)
        .map((round) =>
          completeSetValues(exercise, this.form.inputs[setInputKey(id, round)]),
        )
        .every(Boolean)
    ) {
      return;
    }

    this.form = {
      ...this.form,
      inputs: { ...this.form.inputs, [setInputKey(id, nextRound)]: blank() },
    };
    this.emit();
  };

  removeSet = async (id: string, round: number) => {
    const key = setInputKey(id, round);
    this.cancel(key);

    if (this.deleting.has(key)) {
      return;
    }

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
            logId: this.form.id,
            sessionExerciseId: this.form.sessionExerciseIds?.[id] ?? "",
            round,
          });
        } catch {}

        if (success) {
          this.clearRow(id, round);
        } else {
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
    const key = setInputKey(id, round);
    const inputs = { ...this.form.inputs };
    delete inputs[key];
    this.saved.delete(key);
    this.dirty.delete(key);
    delete this.errors[key];
    const setDefinitions = { ...this.form.setDefinitions };
    delete setDefinitions[key];
    this.form = { ...this.form, inputs, setDefinitions };
    this.emit();
  }

  sync(log: WorkoutLog) {
    if (!this.headerConfirmed && this.queued.size && log.id === this.form.id) {
      return;
    }
    let changed =
      this.form.id !== log.id || this.form.completedAt !== log.completedAt;

    if (!this.headerConfirmed && !this.queued.size) {
      this.headerConfirmed = true;
      changed = true;
    }

    for (const [id, value] of Object.entries(log.sessionExerciseIds ?? {})) {
      if (this.form.sessionExerciseIds?.[id] !== value) {
        changed = true;
      }
    }

    const remote = openWorkoutLog(this.form.snapshot, log);
    const knownIds = new Set(this.form.snapshot.exercises.map((row) => row.id));
    const additions = remote.snapshot.exercises.filter(
      (row) => !knownIds.has(row.id),
    );
    const logOnlyIds = [
      ...new Set([
        ...(this.form.logOnlyExerciseIds ?? []),
        ...(remote.logOnlyExerciseIds ?? []),
      ]),
    ];

    if (
      additions.length ||
      logOnlyIds.length !== (this.form.logOnlyExerciseIds?.length ?? 0)
    ) {
      changed = true;
    }

    for (const id of remote.logOnlyExerciseIds ?? []) {
      if (
        this.unsavedExercises.has(id) &&
        !this.queued.size &&
        log.sessionExerciseIds?.[id] &&
        ![...this.dirty, ...this.queued, ...this.deleting].some((key) =>
          key.startsWith(`${id}:`),
        )
      ) {
        this.unsavedExercises.delete(id);
        changed = true;
      }
    }

    const inputs = { ...this.form.inputs };
    const setDefinitions = { ...this.form.setDefinitions };

    for (const key of new Set([
      ...Object.keys(setDefinitions),
      ...Object.keys(remote.setDefinitions ?? {}),
    ])) {
      if (
        this.dirty.has(key) ||
        this.queued.has(key) ||
        this.deleting.has(key)
      ) {
        continue;
      }
      const next = remote.setDefinitions?.[key];
      if (JSON.stringify(setDefinitions[key]) !== JSON.stringify(next)) {
        changed = true;
        if (next) {
          setDefinitions[key] = next;
        } else {
          delete setDefinitions[key];
        }
      }
    }

    for (const key of new Set([
      ...Object.keys(inputs),
      ...Object.keys(remote.inputs),
    ])) {
      if (
        this.dirty.has(key) ||
        this.queued.has(key) ||
        this.deleting.has(key)
      ) {
        continue;
      }

      const next = remote.inputs[key];
      const current = inputs[key];
      const id = key.slice(0, key.lastIndexOf(":"));
      const exercise = this.form.snapshot.exercises.find((e) => e.id === id);

      if (fingerprint(next) === fingerprint(current)) {
        continue;
      }

      if (
        exercise &&
        next &&
        current &&
        completeSetValues(exercise, next) !== undefined &&
        JSON.stringify(completeSetValues(exercise, next)) ===
          JSON.stringify(completeSetValues(exercise, current))
      ) {
        continue;
      }

      if (next) {
        inputs[key] = next;
      } else {
        delete inputs[key];
      }

      if (next) {
        this.saved.set(key, { ...next });
      } else {
        this.saved.delete(key);
      }

      changed = true;
    }

    if (changed) {
      this.form = {
        ...this.form,
        id: log.id,
        completedAt: log.completedAt,
        completedOn: log.completedOn,
        sessionExerciseIds: {
          ...this.form.sessionExerciseIds,
          ...log.sessionExerciseIds,
        },
        snapshot: {
          ...this.form.snapshot,
          exercises: [...this.form.snapshot.exercises, ...additions],
        },
        logOnlyExerciseIds: logOnlyIds,
        inputs,
        setDefinitions,
      };
      this.emit();
    }
  }

  activate() {
    this.disposed = false;
  }

  dispose() {
    this.disposed = true;

    for (const key of this.timers.keys()) {
      this.cancel(key);
    }

    this.listeners.clear();
  }
}
