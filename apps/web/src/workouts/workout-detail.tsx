import { workoutExercisesSchema } from "@home-hub/shared/workouts";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import { Button, Check, History, InlineAlert, Play } from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useMemo, useRef, useState } from "react";
import { useAppHeaderRightComponent } from "../app-header-right-component";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { WorkoutExercises, WorkoutText } from "./workout-fields";
import { WorkoutLogView } from "./workout-log";

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
  const active = logs.find((l) => l.status === "active");
  const selected = logs.find((l) => l.id === selectedId);
  const loaded = result.type === "complete" && logResult.type === "complete";
  const disabled = !enabled || !loaded;
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
  async function log(action: "start" | "complete") {
    if (disabled || pending.current) return;
    if (action === "start" && active) {
      setSelectedId(active.id);
      return;
    }
    pending.current = true;
    setBusy(true);
    setDone(false);
    const logId =
      selected?.status === "active"
        ? selected.id
        : (active?.id ?? crypto.randomUUID());
    try {
      if (
        await save(
          mutators.workouts.log({
            householdId,
            workoutId,
            logId,
            action,
            optimisticTimestamp: Date.now(),
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
  // Keep the latest command behind a stable header element; typing in seamless
  // editors should not continually replace the application header.
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
  const scope = () => ({
    householdId,
    workoutId,
    optimisticTimestamp: Date.now(),
  });
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
    <article className="grid min-w-0 gap-6">
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
      {selected ? (
        <WorkoutLogView
          log={selected}
          previous={logs}
          disabled={disabled || busy}
          onClose={() => setSelectedId(undefined)}
          onSave={(exerciseId, round, values) =>
            save(
              mutators.workouts.saveSet({
                ...scope(),
                logId: selected.id,
                exerciseId,
                round,
                values,
              }),
            )
          }
        />
      ) : (
        <>
          <div className="grid gap-1">
            <WorkoutText
              label="Workout name"
              value={workout.title}
              disabled={disabled}
              onSave={(title) =>
                save(
                  mutators.workouts.update({ ...scope(), changes: { title } }),
                )
              }
            />
            <details>
              <summary className="cursor-pointer py-2 text-sm text-muted">
                Notes
              </summary>
              <WorkoutText
                label="Notes"
                value={workout.notes ?? ""}
                multiline
                disabled={disabled}
                onSave={(notes) =>
                  save(
                    mutators.workouts.update({
                      ...scope(),
                      changes: { notes },
                    }),
                  )
                }
              />
            </details>
          </div>
          <div>
            <Button
              variant="ghost"
              className="px-1! font-normal text-muted"
              disabled={disabled || busy}
              onClick={() => void log("start")}
            >
              <Play aria-hidden="true" className="size-4" />
              {active ? "Resume logging" : "Log sets"}
            </Button>
          </div>
          <WorkoutExercises
            current={workoutExercisesSchema.parse(workout.exercises)}
            disabled={disabled}
            onSave={(exercises) =>
              save(
                mutators.workouts.update({
                  ...scope(),
                  changes: { exercises },
                }),
              )
            }
          />

          <section className="min-w-0">
            <h2 className="flex items-center gap-2 py-2 font-semibold">
              <History aria-hidden="true" className="size-4" />
              History
            </h2>
            <ul className="divide-y divide-border">
              {logs.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center gap-3 py-2 text-left text-sm outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                    onClick={() => setSelectedId(entry.id)}
                  >
                    {entry.status === "completed" && (
                      <Check aria-hidden="true" className="size-4 text-muted" />
                    )}
                    <span>
                      {entry.completedOn ??
                        new Date(entry.createdAt ?? 0).toLocaleDateString()}
                    </span>
                    <span className="ml-auto text-xs text-muted">
                      {entry.status === "completed"
                        ? "Done"
                        : entry.status === "active"
                          ? "In progress"
                          : "Abandoned"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </article>
  );
}
