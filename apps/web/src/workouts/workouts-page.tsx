import { calendarDate, shiftCalendarDate } from "@home-hub/shared/habits";
import {
  starterWorkoutPlan,
  starterWorkoutTitle,
} from "@home-hub/shared/workout-seed";
import {
  cycleWeek,
  nextWorkout,
  type WorkoutPlan,
  workoutPlanSchema,
  workoutSnapshotSchema,
  workoutWeekStart,
} from "@home-hub/shared/workouts";
import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import { Button, ConfirmationPopover, InlineAlert } from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useEffect, useRef, useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { PlanEditor } from "./plan-editor";
import { WorkoutSession } from "./workout-session";

export function WorkoutsPage({ householdId }: { householdId: string }) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const [plans, plansResult] = useQuery(
    queries.workouts.plans({ householdId }),
  );
  const [cycles, cyclesResult] = useQuery(
    queries.workouts.cycles({ householdId }),
  );
  const [sessions, sessionsResult] = useQuery(
    queries.workouts.sessions({ householdId }),
  );
  const [editing, setEditing] = useState<{
    id: string;
    title: string;
    plan: WorkoutPlan;
    create: boolean;
  }>();
  const [selectedSession, setSelectedSession] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = setInterval(update, 60000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = calendarDate(now, timeZone);
  const weekStart = workoutWeekStart(today);
  const cycle = cycles[0];
  const planRow = plans.find((p) => p.id === cycle?.planId);
  const plan = planRow
    ? workoutPlanSchema.parse(planRow.definition)
    : undefined;
  const cycleSessions = sessions.filter(
    (s) => s.cycleId === cycle?.id && s.status === "completed",
  );
  const last = [...cycleSessions].sort(
    (a, b) =>
      (b.completedAt ?? 0) - (a.completedAt ?? 0) || b.id.localeCompare(a.id),
  )[0];
  const next = plan ? nextWorkout(plan, last?.workoutId) : undefined;
  const active = sessions.find((s) => s.status === "active");
  const selected = sessions.find((s) => s.id === selectedSession);
  const week = cycle ? cycleWeek(cycle.startedOn, today) : 1;
  const thisWeek = sessions.filter(
    (s) =>
      s.status === "completed" &&
      s.completedOn &&
      s.completedOn >= weekStart &&
      s.completedOn <= today,
  ).length;
  const loaded = [plansResult, cyclesResult, sessionsResult].every(
    (r) => r.type === "complete",
  );
  const disabled = !enabled || busy || !loaded;
  async function change(
    request: Parameters<typeof zero.mutate>[0],
  ): Promise<boolean> {
    if (!enabled || pending.current || !loaded) return false;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const mutation = zero.mutate(request);
      const client = await mutation.client;
      const result = client.type === "error" ? client : await mutation.server;
      if (result.type === "error") {
        setError(
          "Unable to save. Check your connection and retry; another device may have changed this workout.",
        );
        return false;
      }
      return true;
    } catch {
      setError("Unable to save. Please retry.");
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const scope = () => ({ householdId, optimisticTimestamp: Date.now() });
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6">
      {error && (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      )}
      {[plansResult, cyclesResult, sessionsResult].some(
        (r) => r.type === "error",
      ) ? (
        <InlineAlert role="alert" variant="danger">
          Unable to load workouts.
        </InlineAlert>
      ) : !loaded ? (
        <p className="text-muted">Loading workouts…</p>
      ) : null}
      {!enabled && (
        <p className="text-sm text-muted">Read-only while disconnected.</p>
      )}
      {editing ? (
        <PlanEditor
          key={editing.id}
          initial={editing.plan}
          initialTitle={editing.title}
          disabled={disabled}
          onCancel={() => setEditing(undefined)}
          onSave={(title, definition) =>
            change(
              mutators.workouts.savePlan({
                ...scope(),
                planId: editing.id,
                create: editing.create,
                title,
                definition,
              }),
            )
          }
        />
      ) : selected ? (
        <WorkoutSession
          key={selected.id}
          session={selected}
          previousSessions={sessions}
          disabled={disabled}
          firstWeek={
            cycleWeek(
              cycles.find((c) => c.id === selected.cycleId)?.startedOn ?? today,
              calendarDate(selected.createdAt ?? 0, timeZone),
            ) === 1
          }
          onClose={() => setSelectedSession(undefined)}
          onSaveSet={(exerciseId, round, values) =>
            change(
              mutators.workouts.saveSet({
                ...scope(),
                sessionId: selected.id,
                exerciseId,
                round,
                values,
              }),
            )
          }
          onAction={(action, note) =>
            change(
              mutators.workouts.sessionAction({
                ...scope(),
                sessionId: selected.id,
                action,
                note,
                timeZone,
              }),
            )
          }
        />
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-semibold">Workouts</h1>
            <p className="mt-1 text-muted">
              Shared plans. Your sessions and performance stay private.
            </p>
          </div>
          <section className="grid gap-3 rounded-lg border border-border p-5">
            <h2 className="text-lg font-semibold">
              {thisWeek} / 3 sessions this week
            </h2>
            <p className="text-sm text-muted">
              Monday–Sunday · Ideally leave a day between sessions. Missed a
              day? Continue the next letter; don't catch up.
            </p>
            {cycle && (
              <>
                <p>
                  Week {Math.min(week, 6)} of 6 · {cycleSessions.length}{" "}
                  sessions in this cycle
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {Array.from({ length: 6 }, (_, i) => {
                    const start = shiftCalendarDate(cycle.startedOn, i * 7);
                    const end = shiftCalendarDate(start, 6);
                    const count = cycleSessions.filter(
                      (s) =>
                        s.completedOn &&
                        s.completedOn >= start &&
                        s.completedOn <= end,
                    ).length;
                    return (
                      <div
                        key={start}
                        className="rounded bg-raised p-2 text-center text-sm"
                      >
                        Week {i + 1}
                        <br />
                        {count} / 3
                      </div>
                    );
                  })}
                </div>
                {week > 6 && (
                  <p className="text-sm">
                    Six weeks reached: review consistency, loads, volume, and
                    exercise choices. Start a new cycle when ready; history is
                    retained.
                  </p>
                )}
              </>
            )}
            {active ? (
              <Button
                disabled={!loaded}
                onClick={() => setSelectedSession(active.id)}
              >
                Resume{" "}
                {workoutSnapshotSchema.parse(active.snapshot).workout.name}
              </Button>
            ) : next && cycle ? (
              <>
                <h3 className="font-semibold">Next: {next.name}</h3>
                <div className="flex flex-wrap gap-2">
                  {[false, true].map((lowEnergy) => (
                    <Button
                      key={String(lowEnergy)}
                      variant={lowEnergy ? "secondary" : "primary"}
                      disabled={disabled}
                      onClick={async () => {
                        const sessionId = crypto.randomUUID();
                        if (
                          await change(
                            mutators.workouts.startSession({
                              ...scope(),
                              cycleId: cycle.id,
                              sessionId,
                              lowEnergy,
                              timeZone,
                            }),
                          )
                        )
                          setSelectedSession(sessionId);
                      }}
                    >
                      {lowEnergy ? "Low-energy · one round" : "Start workout"}
                    </Button>
                  ))}
                </div>
                <p className="text-sm text-muted">
                  {week === 1
                    ? "First week: leave 3–4 reps in reserve."
                    : "Keep 2–3 clean reps in reserve."}{" "}
                  Low-energy sessions count.
                </p>
              </>
            ) : (
              <p>Choose a plan below to start your personal six-week cycle.</p>
            )}
          </section>
          <section className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Shared plans</h2>
              <Button
                variant="secondary"
                disabled={disabled}
                onClick={() =>
                  setEditing({
                    id: crypto.randomUUID(),
                    title: "New plan",
                    create: true,
                    plan: {
                      warmup: "",
                      finish: "",
                      guidance: "",
                      incrementKg: null,
                      workouts: [
                        {
                          id: crypto.randomUUID(),
                          name: "Workout A",
                          exercises: [
                            {
                              id: crypto.randomUUID(),
                              name: "New exercise",
                              pair: 1,
                              sets: 2,
                              min: 8,
                              max: 12,
                              load: "per-hand",
                              unit: "reps",
                              unilateral: false,
                              cues: "",
                            },
                          ],
                        },
                      ],
                    },
                  })
                }
              >
                Create plan
              </Button>
            </div>
            {!plans.some((p) => p.title === starterWorkoutTitle) && (
              <Button
                variant="secondary"
                disabled={disabled}
                onClick={() =>
                  void change(
                    mutators.workouts.savePlan({
                      ...scope(),
                      planId: crypto.randomUUID(),
                      title: starterWorkoutTitle,
                      definition: starterWorkoutPlan,
                      create: true,
                    }),
                  )
                }
              >
                Add six-week A/B/C starter plan
              </Button>
            )}
            {plans.map((row) => {
              const definition = workoutPlanSchema.parse(row.definition);
              return (
                <div
                  key={row.id}
                  className="grid gap-3 rounded-lg border border-border p-4"
                >
                  <h3 className="font-semibold">{row.title}</h3>
                  <p className="text-sm text-muted">
                    {definition.workouts.map((w) => w.name).join(" → ")}
                  </p>
                  <details>
                    <summary className="cursor-pointer text-sm">
                      Preview program
                    </summary>
                    <div className="grid gap-3 py-3 text-sm">
                      <p className="whitespace-pre-line">
                        {definition.guidance}
                      </p>
                      <p className="whitespace-pre-line">{definition.warmup}</p>
                      {definition.workouts.map((w) => (
                        <div key={w.id}>
                          <h4 className="font-medium">{w.name}</h4>
                          {w.exercises.map((e) => (
                            <p key={e.id}>
                              {e.pair} · {e.name}: {e.sets} × {e.min}–{e.max}{" "}
                              {e.unit}
                              {e.unilateral ? " each side" : ""} — {e.cues}
                            </p>
                          ))}
                        </div>
                      ))}
                      <p className="whitespace-pre-line">{definition.finish}</p>
                    </div>
                  </details>
                  <div className="flex flex-wrap gap-2">
                    <ConfirmationPopover
                      message={
                        cycle
                          ? "Start a new six-week cycle at the first workout? Your previous history will be retained."
                          : "Start your personal six-week cycle with this plan?"
                      }
                      trigger={
                        <Button
                          variant="secondary"
                          disabled={disabled || !!active}
                        >
                          {cycle
                            ? "Start new six-week cycle"
                            : "Start six-week cycle"}
                        </Button>
                      }
                      onConfirm={() =>
                        change(
                          mutators.workouts.startCycle({
                            ...scope(),
                            planId: row.id,
                            cycleId: crypto.randomUUID(),
                            timeZone,
                          }),
                        ).then(() => {})
                      }
                    />
                    <Button
                      variant="ghost"
                      disabled={disabled}
                      onClick={() =>
                        setEditing({
                          id: row.id,
                          title: row.title,
                          plan: definition,
                          create: false,
                        })
                      }
                    >
                      Edit plan
                    </Button>
                  </div>
                </div>
              );
            })}
          </section>
          <section className="grid gap-3">
            <h2 className="text-lg font-semibold">Your session history</h2>
            {!sessions.length && loaded && (
              <p className="text-muted">
                No sessions yet. Showing up is the goal.
              </p>
            )}
            {sessions.map((s) => (
              <button
                type="button"
                key={s.id}
                className="flex flex-wrap justify-between gap-2 rounded-lg border border-border p-4 text-left hover:bg-raised"
                onClick={() => setSelectedSession(s.id)}
              >
                <span>
                  {workoutSnapshotSchema.parse(s.snapshot).workout.name}
                  {s.lowEnergy ? " · Low energy" : ""}
                </span>
                <span className="text-sm text-muted">
                  {s.completedOn ??
                    new Date(s.createdAt ?? 0).toLocaleDateString()}{" "}
                  · {s.status}
                </span>
              </button>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
