import {
  progressionSuggestion,
  type WorkoutExercise,
  type WorkoutSetValues,
  workoutSetValuesSchema,
  workoutSnapshotSchema,
} from "@home-hub/shared/workouts";
import { mutators } from "@home-hub/shared/zero/mutators";
import type {
  WorkoutSession as SessionRow,
  WorkoutSet,
} from "@home-hub/shared/zero/schema";
import {
  ArrowLeft,
  Button,
  Check,
  ConfirmationPopover,
  Dumbbell,
  ErrorPopover,
  IconButton,
  InlineAlert,
  Input,
  Settings,
  StickyNote,
  Textarea,
  Timer,
  Trash2,
  X,
} from "@home-hub/ui-web";
import { useZero } from "@rocicorp/zero/react";
import { useEffect, useRef, useState } from "react";
import { useDebouncedTextEditor } from "../recipes/use-debounced-text-editor";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
export type Session = SessionRow & { readonly sets: readonly WorkoutSet[] };

function RestTimer() {
  const [deadline, setDeadline] = useState<number>();
  const [now, setNow] = useState(Date.now);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!deadline) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [deadline]);
  const seconds = deadline
    ? Math.max(0, Math.ceil((deadline - now) / 1000))
    : undefined;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
      <Button
        variant="ghost"
        size="compact"
        className="px-1! font-normal text-muted"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Timer aria-hidden="true" className="size-4" />
        Rest timer{seconds !== undefined && !open ? ` · ${seconds}s` : ""}
      </Button>
      {open && (
        <>
          {[45, 60, 75].map((s) => (
            <Button
              key={s}
              type="button"
              variant="ghost"
              size="compact"
              onClick={() => {
                setNow(Date.now());
                setDeadline(Date.now() + s * 1000);
              }}
            >
              {s}s
            </Button>
          ))}
          {seconds !== undefined && (
            <>
              <span role="timer">
                {seconds ? `${seconds}s remaining` : "Rest finished"}
              </span>
              <IconButton
                aria-label="Clear rest timer"
                title="Clear timer"
                className="size-7!"
                onClick={() => setDeadline(undefined)}
              >
                <X aria-hidden="true" className="size-4" />
              </IconButton>
            </>
          )}
          <span className="text-xs">Take longer if needed.</span>
        </>
      )}
    </div>
  );
}
function SetForm({
  exercise,
  round,
  saved,
  previous,
  disabled,
  onSave,
}: {
  exercise: WorkoutExercise;
  round: number;
  saved?: WorkoutSetValues | undefined;
  previous?: WorkoutSetValues | undefined;
  disabled: boolean;
  onSave: (values: WorkoutSetValues) => Promise<boolean>;
}) {
  const initial = saved ?? {
    weightKg:
      exercise.load === "bodyweight" ? null : (previous?.weightKg ?? null),
    amount: exercise.min,
    rightAmount: null,
    rir: null,
    goodForm: false,
    skipped: false,
    note: "",
  };
  const [values, setValues] = useState<WorkoutSetValues>(initial);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(!saved);
  const [details, setDetails] = useState(false);
  const savedJson = saved ? JSON.stringify(saved) : undefined;
  useEffect(() => {
    if (!dirty && savedJson)
      setValues(workoutSetValuesSchema.parse(JSON.parse(savedJson)));
  }, [dirty, savedJson]);
  function patch(p: Partial<WorkoutSetValues>) {
    setDirty(true);
    setValues((v) => ({ ...v, ...p }));
  }
  const label = `${exercise.name}, set ${round}`;
  return (
    <form
      aria-label={`Log ${label}`}
      className="grid min-w-0 gap-1 py-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const parsed = workoutSetValuesSchema.safeParse(values);
        if (!parsed.success) {
          setError(
            "Enter valid repetitions/time and load. Skipped sets need a reason.",
          );
          setDetails(true);
          return;
        }
        setError("");
        if (await onSave(parsed.data)) setDirty(false);
      }}
    >
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <h5 className="text-sm font-medium">{exercise.name}</h5>
          <p className="text-xs text-muted">
            {exercise.min}–{exercise.max} {exercise.unit}
            {exercise.unilateral ? " each side" : ""}
            {values.skipped ? " · Skipped" : ""}
          </p>
        </div>
        <IconButton
          type="button"
          aria-label={`Options for ${label}`}
          title="Set options"
          aria-expanded={details}
          className="size-8!"
          disabled={disabled}
          onClick={() => setDetails((v) => !v)}
        >
          <Settings aria-hidden="true" className="size-4" />
        </IconButton>
        <IconButton
          type="submit"
          aria-label={saved && !dirty ? `${label} saved` : `Save ${label}`}
          title={saved && !dirty ? "Saved" : "Save set"}
          className={`size-8! ${saved && !dirty ? "text-primary" : ""}`}
          disabled={disabled || !dirty}
        >
          <Check aria-hidden="true" className="size-4" />
        </IconButton>
      </div>
      <fieldset disabled={disabled} className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          {exercise.load !== "bodyweight" && (
            <div className="flex items-center gap-1">
              <Input
                appearance="seamless"
                aria-label={`Weight in kg for ${label}`}
                className="h-8! w-16 flex-none! text-sm tabular-nums"
                type="number"
                step="0.01"
                min="0"
                max="1000"
                value={values.weightKg ?? ""}
                placeholder="—"
                onValueChange={(v) =>
                  patch({ weightKg: v === "" ? null : Number(v) })
                }
              />
              <span>
                kg {exercise.load === "per-hand" ? "/ hand" : "single"}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Input
              appearance="seamless"
              aria-label={`${exercise.unit}${exercise.unilateral ? " left" : ""} for ${label}`}
              className="h-8! w-14 flex-none! text-sm tabular-nums"
              type="number"
              min={values.skipped ? 0 : 1}
              max="600"
              required
              value={values.amount}
              onValueChange={(v) => patch({ amount: Number(v) })}
            />
            <span>
              {exercise.unit}
              {exercise.unilateral ? " left" : ""}
            </span>
          </div>
          {exercise.unilateral && (
            <div className="flex items-center gap-1">
              <Input
                appearance="seamless"
                aria-label={`${exercise.unit} right for ${label}`}
                className="h-8! w-14 flex-none! text-sm tabular-nums"
                type="number"
                min="1"
                max="600"
                value={values.rightAmount ?? ""}
                placeholder="Same"
                onValueChange={(v) =>
                  patch({ rightAmount: v === "" ? null : Number(v) })
                }
              />
              <span>right</span>
            </div>
          )}
          <label className="flex min-h-8 items-center gap-2">
            <input
              type="checkbox"
              checked={values.goodForm}
              disabled={values.skipped}
              onChange={(e) => patch({ goodForm: e.target.checked })}
            />
            Good form, no symptoms
          </label>
        </div>
        {previous && (
          <p className="px-1 text-xs text-subtle">
            Previous:{" "}
            {previous.skipped
              ? "skipped"
              : `${previous.amount}${exercise.unilateral ? ` / ${previous.rightAmount ?? previous.amount}` : ""} ${exercise.unit}${previous.weightKg !== null ? ` · ${previous.weightKg} kg` : ""}`}
          </p>
        )}
        <details>
          <summary className="cursor-pointer px-1 py-1 text-xs text-muted">
            Technique cues
          </summary>
          <p className="px-1 pb-2 text-sm text-muted">{exercise.cues}</p>
        </details>
        {details && (
          <div className="grid gap-2 pb-2">
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
              <div className="flex items-center gap-1">
                <span>Reps in reserve</span>
                <Input
                  appearance="seamless"
                  aria-label={`Reps in reserve for ${label}`}
                  className="h-8! w-16 flex-none! text-sm"
                  type="number"
                  min="0"
                  max="10"
                  value={values.rir ?? ""}
                  placeholder="—"
                  onValueChange={(v) =>
                    patch({ rir: v === "" ? null : Number(v) })
                  }
                />
              </div>
              <label className="flex min-h-8 items-center gap-2">
                <input
                  type="checkbox"
                  checked={values.skipped}
                  onChange={(e) =>
                    patch({ skipped: e.target.checked, goodForm: false })
                  }
                />
                Skip set (symptoms or wrist rehab)
              </label>
            </div>
            <Input
              appearance="seamless"
              aria-label={`${values.skipped ? "Reason for skipping" : "Note for"} ${label}`}
              className="h-8! text-sm"
              maxLength={500}
              required={values.skipped}
              placeholder={
                values.skipped ? "Reason for skipping…" : "Add a set note…"
              }
              value={values.note}
              onValueChange={(note) => patch({ note })}
            />
          </div>
        )}
        {!details && values.skipped && (
          <Input
            appearance="seamless"
            aria-label={`Reason for skipping ${label}`}
            className="h-8! text-sm"
            maxLength={500}
            required
            value={values.note}
            placeholder="Reason for skipping…"
            onValueChange={(note) => patch({ note })}
          />
        )}
      </fieldset>
      {dirty && (
        <span className="px-1 text-xs text-subtle">
          Not saved · use the checkmark or press Enter
        </span>
      )}
      {error && (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      )}
    </form>
  );
}
export function WorkoutSession({
  session,
  previousSessions,
  disabled,
  firstWeek,
  onSaveSet,
  onAction,
  onClose,
}: {
  session: Session;
  previousSessions: readonly Session[];
  disabled: boolean;
  firstWeek: boolean;
  onSaveSet: (
    exerciseId: string,
    round: number,
    values: WorkoutSetValues,
  ) => Promise<boolean>;
  onAction: (
    action: "complete" | "abandon" | "note",
    note: string,
  ) => Promise<boolean>;
  onClose: () => void;
}) {
  const snapshot = workoutSnapshotSchema.parse(session.snapshot);
  const zero = useZero();
  const mutationEnabled = useZeroMutationEnabled();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const noteEditor = useDebouncedTextEditor({
    currentValue: session.note ?? "",
    mutationEnabled,
    normalize: (value) => value.trim(),
    failureError: "Unable to save session note.",
    save: async (note) => {
      try {
        const mutation = zero.mutate(
          mutators.workouts.sessionAction({
            householdId: session.householdId,
            sessionId: session.id,
            action: "note",
            note,
            optimisticTimestamp: Date.now(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        );
        const client = await mutation.client;
        const result = client.type === "error" ? client : await mutation.server;
        return result.type === "success";
      } catch {
        return false;
      }
    },
  });
  const note = noteEditor.value;
  const exercises = [...snapshot.workout.exercises].sort(
    (a, b) => a.pair - b.pair,
  );
  const complete = exercises.every((e) =>
    Array.from({ length: session.lowEnergy ? 1 : e.sets }, (_, i) =>
      session.sets.some((s) => s.exerciseId === e.id && s.round === i + 1),
    ).every(Boolean),
  );
  return (
    <article className="grid min-w-0 gap-5">
      <div className="flex min-w-0 items-center gap-2">
        <IconButton
          aria-label="Back to workouts"
          title="Back"
          onClick={onClose}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
        </IconButton>
        <h1 className="min-w-0 flex-1 text-xl font-semibold text-primary">
          {snapshot.workout.name}
        </h1>
        {session.status === "active" && (
          <ConfirmationPopover
            message="Abandon this session? Saved sets remain in history; the rotation will not advance."
            trigger={
              <IconButton
                aria-label="Abandon session"
                title="Abandon session"
                disabled={disabled}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </IconButton>
            }
            onConfirm={async () => {
              if (await onAction("abandon", note)) onClose();
            }}
          />
        )}
      </div>
      <div className="grid gap-1">
        <p className="text-xs text-muted">
          {session.completedOn ??
            new Date(session.createdAt ?? 0).toLocaleDateString()}{" "}
          · {session.status}
          {session.lowEnergy ? " · Low energy" : ""} · Private log
        </p>
        <p className="text-sm text-muted">
          {firstWeek
            ? "Week one: leave 3–4 clean repetitions in reserve."
            : "Leave 2–3 clean repetitions in reserve."}{" "}
          Don't rush technique.
        </p>
      </div>
      <details>
        <summary className="cursor-pointer py-1 text-sm text-muted">
          Program & safety guidance
        </summary>
        <p className="whitespace-pre-line py-2 text-sm text-muted">
          {snapshot.guidance}
        </p>
      </details>
      <details>
        <summary className="cursor-pointer py-1 text-sm font-medium">
          Warm-up · 4 minutes
        </summary>
        <p className="whitespace-pre-line py-2 text-sm text-muted">
          {snapshot.warmup}
        </p>
      </details>
      {session.status === "active" && <RestTimer />}
      <p className="text-xs text-muted">
        Exercise 1 → switch 15–30s → exercise 2 → rest 45–75s. Repeat the pair
        before moving on.
      </p>
      {[...new Set(exercises.map((e) => e.pair))].map((pair) => (
        <section key={pair} className="grid min-w-0 gap-2">
          <h2 className="flex items-center gap-2 py-2 font-semibold">
            <Dumbbell aria-hidden="true" className="size-4" />
            Pair {pair}
          </h2>
          {Array.from(
            {
              length: session.lowEnergy
                ? 1
                : Math.max(
                    ...exercises
                      .filter((e) => e.pair === pair)
                      .map((e) => e.sets),
                  ),
            },
            (_, i) => i + 1,
          ).map((round) => (
            <div key={round} className="min-w-0">
              <h3 className="py-1 text-xs font-medium text-muted">
                Round {round}
              </h3>
              <div className="divide-y divide-border">
                {exercises
                  .filter(
                    (e) =>
                      e.pair === pair && (session.lowEnergy || e.sets >= round),
                  )
                  .map((exercise) => {
                    const previous = [...previousSessions]
                      .sort(
                        (a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0),
                      )
                      .find(
                        (s) =>
                          s.id !== session.id &&
                          s.status === "completed" &&
                          (s.completedAt ?? 0) <
                            (session.completedAt ?? session.createdAt ?? 0) &&
                          s.sets.some((set) => set.exerciseId === exercise.id),
                      );
                    const saved = session.sets.find(
                      (s) => s.exerciseId === exercise.id && s.round === round,
                    );
                    const old = previous?.sets.find(
                      (s) => s.exerciseId === exercise.id && s.round === round,
                    );
                    return (
                      <SetForm
                        key={`${exercise.id}:${round}`}
                        exercise={exercise}
                        round={round}
                        disabled={disabled || session.status === "abandoned"}
                        saved={
                          saved
                            ? workoutSetValuesSchema.parse(saved.values)
                            : undefined
                        }
                        previous={
                          old
                            ? workoutSetValuesSchema.parse(old.values)
                            : undefined
                        }
                        onSave={(values) =>
                          onSaveSet(exercise.id, round, values)
                        }
                      />
                    );
                  })}
              </div>
            </div>
          ))}
          <details>
            <summary className="cursor-pointer py-1 text-xs text-muted">
              Progression guidance
            </summary>
            <div className="grid gap-2 py-2">
              {exercises
                .filter((e) => e.pair === pair)
                .map((exercise) => (
                  <p key={exercise.id} className="text-xs text-muted">
                    {exercise.name}:{" "}
                    {progressionSuggestion(
                      exercise,
                      session.sets.map((s) => ({
                        ...workoutSetValuesSchema.parse(s.values),
                        exerciseId: s.exerciseId,
                        round: s.round,
                      })),
                      snapshot.incrementKg,
                    )}
                  </p>
                ))}
            </div>
          </details>
        </section>
      ))}
      <details>
        <summary className="cursor-pointer py-2 text-sm font-medium">
          Finish · 2–3 minutes
        </summary>
        <p className="whitespace-pre-line py-2 text-sm text-muted">
          {snapshot.finish}
        </p>
      </details>
      <div className="flex min-w-0 items-start gap-2">
        <StickyNote
          aria-hidden="true"
          className="mt-3 size-4 shrink-0 text-muted"
        />
        <Textarea
          ref={noteRef}
          appearance="seamless"
          aria-label="Session note"
          aria-busy={noteEditor.isSaving || undefined}
          aria-invalid={noteEditor.error ? true : undefined}
          aria-errormessage={noteEditor.error ? noteEditor.errorId : undefined}
          placeholder="Add a session note…"
          rows={1}
          disabled={!mutationEnabled}
          maxLength={1000}
          value={note}
          onBlur={noteEditor.handleBlur}
          onKeyDown={(event) => noteEditor.handleKeyDown(event, false)}
          onChange={(event) => noteEditor.changeValue(event.target.value)}
        />
        <ErrorPopover
          anchor={noteRef}
          id={noteEditor.errorId}
          open={noteEditor.error !== undefined}
          onDismiss={noteEditor.dismissError}
        >
          {noteEditor.error}
        </ErrorPopover>
      </div>
      {session.status === "active" && (
        <div className="grid gap-2">
          <div>
            <Button
              size="compact"
              disabled={disabled || !complete}
              onClick={async () => {
                if (await onAction("complete", note)) onClose();
              }}
            >
              <Check aria-hidden="true" className="size-4" />
              Complete session
            </Button>
          </div>
          {!complete && (
            <p className="text-xs text-muted">
              Save each prescribed set before completing. Low-energy sessions
              need one set per exercise. For symptoms or wrist rehab, skip with
              a reason; never push through to fill the log.
            </p>
          )}
        </div>
      )}
    </article>
  );
}
