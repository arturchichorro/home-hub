import {
  workoutContentSchema,
  workoutExercisesSchema,
} from "@home-hub/shared/workouts";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import { Button, Check, History, InlineAlert } from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useMemo, useRef, useState } from "react";
import { useAppHeaderRightComponent } from "../app-header-right-component";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { WorkoutExercises, WorkoutText } from "./workout-fields";
import { summarizeWorkoutLog } from "./workout-log-summary";

export function WorkoutDetail({
  householdId,
  workoutId,
}: {
  householdId: string;
  workoutId: string;
}) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const [workout, result] = useQuery(
    queries.workouts.detail({ householdId, workoutId }),
  );
  const [logs, logResult] = useQuery(
    queries.workouts.logs({ householdId, workoutId }),
  );
  const [selectedId, setSelectedId] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [done, setDone] = useState(false);
  const noteDraft = useRef<{ logId: string; note: string } | undefined>(
    undefined,
  );
  const active = logs.find((l) => l.status === "active");
  const selected = logs.find((l) => l.id === selectedId);
  const snapshot = selected
    ? workoutContentSchema.parse(selected.snapshot)
    : undefined;
  const loaded = result.type === "complete" && logResult.type === "complete";
  const disabled = !enabled || !loaded;
  const scope = () => ({
    householdId,
    workoutId,
    optimisticTimestamp: Date.now(),
  });
  async function save(request: Parameters<typeof zero.mutate>[0]) {
    if (!enabled || !loaded) return false;
    setError("");
    try {
      const mutation = zero.mutate(request);
      const client = await mutation.client;
      const outcome = client.type === "error" ? client : await mutation.server;
      if (outcome.type === "error") throw new Error("save");
      return true;
    } catch {
      setError("Unable to save workout.");
      return false;
    }
  }
  function draftFor(id: string, saved: string | null) {
    return noteDraft.current?.logId === id
      ? noteDraft.current.note
      : (saved ?? "");
  }
  async function selectLog(id?: string) {
    if (disabled || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      if (selected) {
        const note = draftFor(selected.id, selected.note).trim();
        if (
          !(await save(
            mutators.workouts.updateLogNote({
              ...scope(),
              logId: selected.id,
              note,
            }),
          ))
        )
          return;
      }
      setSelectedId(id);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function log(action: "start" | "complete") {
    if (disabled || pending.current) return;
    if (action === "start" && active) {
      setSelectedId(active.id);
      setDone(false);
      return;
    }
    pending.current = true;
    setBusy(true);
    setDone(false);
    const entry = selected?.status === "active" ? selected : active;
    const logId = entry?.id ?? crypto.randomUUID();
    try {
      if (
        await save(
          mutators.workouts.log({
            ...scope(),
            logId,
            action,
            ...(action === "complete"
              ? { note: draftFor(logId, entry?.note ?? "").trim() }
              : {}),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        )
      ) {
        if (action === "start") setSelectedId(logId);
        else {
          setSelectedId(undefined);
          setDone(true);
        }
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const logRef = useRef(log);
  logRef.current = log;
  const canComplete = !selected || selected.status === "active";
  const header = useMemo(
    () =>
      canComplete ? (
        <Button
          variant="ghost"
          className="h-7! px-1.5! font-normal text-muted"
          disabled={disabled || busy || !workout}
          onClick={() => void logRef.current("complete")}
        >
          <Check aria-hidden="true" className="size-4" />
          Done
        </Button>
      ) : null,
    [canComplete, disabled, busy, workout],
  );
  useAppHeaderRightComponent(header);
  if (result.type === "error" || logResult.type === "error")
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to load workout.
      </InlineAlert>
    );
  if (!workout)
    return result.type === "complete" ? (
      <p className="text-muted">Workout not found.</p>
    ) : null;
  return (
    <article className="grid min-w-0 gap-2">
      {error && (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      )}
      {done && (
        <p role="status" className="text-sm text-muted">
          Done
        </p>
      )}
      <WorkoutText
        label="Workout name"
        value={snapshot?.title ?? workout.title}
        disabled={disabled}
        readOnly={!!selected}
        onSave={(title) =>
          save(mutators.workouts.update({ ...scope(), changes: { title } }))
        }
      />
      <WorkoutExercises
        current={
          snapshot?.exercises ?? workoutExercisesSchema.parse(workout.exercises)
        }
        disabled={disabled || busy}
        onSave={(exercises) =>
          save(mutators.workouts.update({ ...scope(), changes: { exercises } }))
        }
        onStartLogging={() => log("start")}
        onCloseLogging={() => void selectLog()}
        onCompleteLogging={() => void log("complete")}
        resume={!!active}
        logging={
          selected
            ? {
                log: selected,
                previous: logs,
                onSave: (exerciseId, round, values) =>
                  save(
                    mutators.workouts.saveSet({
                      ...scope(),
                      logId: selected.id,
                      exerciseId,
                      round,
                      values,
                    }),
                  ),
              }
            : undefined
        }
      />
      {selected && (
        <section className="grid gap-1" aria-label="Workout log note">
          <h2 className="pt-2 text-sm font-medium">Log note</h2>
          <WorkoutText
            key={selected.id}
            label="Log note"
            placeholder="Add a log note…"
            value={selected.note ?? ""}
            multiline
            disabled={disabled}
            onDraftChange={(note) => {
              noteDraft.current = { logId: selected.id, note };
            }}
            onSave={(note) =>
              save(
                mutators.workouts.updateLogNote({
                  ...scope(),
                  logId: selected.id,
                  note,
                }),
              )
            }
          />
          {selected.status === "active" && (
            <div>
              <Button
                size="compact"
                disabled={disabled || busy}
                onClick={() => void log("complete")}
              >
                <Check aria-hidden="true" className="size-4" />
                Done
              </Button>
            </div>
          )}
        </section>
      )}
      <section className="grid gap-1" aria-label="Workout notes">
        <h2 className="pt-2 text-sm font-medium">Notes</h2>
        <WorkoutText
          label="Notes"
          value={snapshot?.notes ?? workout.notes ?? ""}
          multiline
          disabled={disabled}
          readOnly={!!selected}
          onSave={(notes) =>
            save(mutators.workouts.update({ ...scope(), changes: { notes } }))
          }
        />
      </section>
      <section className="min-w-0">
        <h2 className="flex items-center gap-2 py-3 font-semibold">
          <History aria-hidden="true" className="size-4" />
          History
        </h2>
        <ul className="divide-y divide-border">
          {logs.map((entry) => {
            const summary = summarizeWorkoutLog(entry);
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  aria-pressed={selectedId === entry.id}
                  disabled={disabled || busy}
                  className="grid min-h-11 w-full min-w-0 gap-1 py-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  onClick={() =>
                    void selectLog(
                      selectedId === entry.id ? undefined : entry.id,
                    )
                  }
                >
                  <span className="flex items-center gap-3">
                    {entry.status === "completed" && (
                      <Check
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted"
                      />
                    )}
                    <span>
                      {entry.completedOn ??
                        new Date(entry.createdAt ?? 0).toLocaleDateString()}
                    </span>
                    {entry.status !== "completed" && (
                      <span className="ml-auto text-xs text-muted">
                        {entry.status === "active" ? "Draft" : "Abandoned"}
                      </span>
                    )}
                  </span>
                  <span
                    className={`grid min-w-0 gap-1 text-xs font-normal text-muted ${entry.status === "completed" ? "pl-7" : ""}`}
                  >
                    {summary.length ? (
                      summary.map((exercise) => (
                        <span key={exercise.id} className="break-words">
                          <span className="font-medium">{exercise.name}</span> —{" "}
                          {exercise.details}
                        </span>
                      ))
                    ) : (
                      <span>No sets logged.</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </article>
  );
}
