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
import {
  Button,
  Calendar,
  Check,
  ConfirmationPopover,
  Dumbbell,
  History,
  IconButton,
  InlineAlert,
  Pencil,
  Play,
  Plus,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppHeaderRightComponent } from "../app-header-right-component";
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
  const createPlan = useCallback(
    () =>
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
      }),
    [],
  );
  const headerActions = useMemo(
    () =>
      editing || selected ? null : (
        <Button
          variant="ghost"
          className="h-7! px-1.5! font-normal text-muted"
          disabled={disabled}
          onClick={createPlan}
        >
          <Plus aria-hidden="true" className="size-4" />
          Add plan
        </Button>
      ),
    [editing, selected, disabled, createPlan],
  );
  useAppHeaderRightComponent(headerActions);
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
    <div className="grid min-w-0 gap-6">
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
          <p className="text-xs text-muted">
            Shared plans. Your sessions and performance stay private.
          </p>
          <section className="grid gap-3">
            <h2 className="flex items-center gap-2 font-semibold">
              <Calendar aria-hidden="true" className="size-4" />
              This week{" "}
              <span className="ml-auto text-sm font-normal text-muted">
                {thisWeek} / 3 sessions
              </span>
            </h2>
            <p className="text-xs text-muted">
              Monday–Sunday · Leave a day between sessions when possible. Missed
              a day? Continue the next letter, without catch-up.
            </p>
            {cycle && (
              <>
                <details>
                  <summary className="cursor-pointer py-1 text-sm text-muted">
                    Week {Math.min(week, 6)} of 6 · {cycleSessions.length}{" "}
                    sessions in this cycle
                  </summary>
                  <div className="grid grid-cols-3 gap-4 py-3 sm:grid-cols-6">
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
                        <div key={start} className="text-sm">
                          <p className="text-xs text-muted">Week {i + 1}</p>
                          <p className="mt-1 tabular-nums">
                            {count} <span className="text-muted">/ 3</span>
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </details>
                {week > 6 && (
                  <p className="text-sm text-muted">
                    Six weeks reached: review consistency, loads, and exercise
                    choices. Start a new cycle when ready; history is retained.
                  </p>
                )}
              </>
            )}
            {active ? (
              <div>
                <Button
                  size="compact"
                  disabled={!loaded}
                  onClick={() => setSelectedSession(active.id)}
                >
                  <Play aria-hidden="true" className="size-4" />
                  Resume{" "}
                  {workoutSnapshotSchema.parse(active.snapshot).workout.name}
                </Button>
              </div>
            ) : next && cycle ? (
              <div className="grid gap-2 pt-2">
                <h3 className="text-lg font-semibold text-primary">
                  {next.name}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {[false, true].map((lowEnergy) => (
                    <Button
                      size="compact"
                      key={String(lowEnergy)}
                      variant={lowEnergy ? "ghost" : "primary"}
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
                      <Play aria-hidden="true" className="size-4" />
                      {lowEnergy ? "Low-energy · one round" : "Start workout"}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted">
                  {week === 1
                    ? "First week: leave 3–4 reps in reserve."
                    : "Keep 2–3 clean reps in reserve."}{" "}
                  Low-energy sessions count.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted">
                Choose a plan to start your personal six-week cycle.
              </p>
            )}
          </section>
          <section className="min-w-0">
            <h2 className="flex items-center gap-2 py-3 font-semibold">
              <Dumbbell aria-hidden="true" className="size-4" />
              Plans
            </h2>
            <ul className="min-w-0 divide-y divide-border">
              {plans.map((row) => {
                const definition = workoutPlanSchema.parse(row.definition);
                return (
                  <li key={row.id} className="grid min-w-0 gap-1 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          className="text-left font-medium outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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
                          {row.title}
                        </button>
                        <p className="mt-1 text-xs text-muted">
                          {definition.workouts.map((w) => w.name).join(" → ")}
                        </p>
                      </div>
                      <IconButton
                        className="size-8!"
                        aria-label={`Edit ${row.title}`}
                        title="Edit plan"
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
                        <Pencil aria-hidden="true" className="size-4" />
                      </IconButton>
                      <ConfirmationPopover
                        message={
                          cycle
                            ? "Start a new six-week cycle at the first workout? Your previous history will be retained."
                            : "Start your personal six-week cycle with this plan?"
                        }
                        trigger={
                          <IconButton
                            className="size-8!"
                            aria-label={`Start ${cycle ? "new " : ""}six-week cycle with ${row.title}`}
                            title={cycle ? "Start new cycle" : "Start cycle"}
                            disabled={disabled || !!active}
                          >
                            <Play aria-hidden="true" className="size-4" />
                          </IconButton>
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
                    </div>
                    <details>
                      <summary className="cursor-pointer py-2 text-xs text-muted">
                        Program details
                      </summary>
                      <div className="grid gap-3 py-2 text-sm text-muted">
                        <p className="whitespace-pre-line">
                          {definition.guidance}
                        </p>
                        <p className="whitespace-pre-line">
                          {definition.warmup}
                        </p>
                        {definition.workouts.map((w) => (
                          <div key={w.id}>
                            <h4 className="font-medium text-foreground">
                              {w.name}
                            </h4>
                            {w.exercises.map((e) => (
                              <p key={e.id}>
                                {e.pair} · {e.name}: {e.sets} × {e.min}–{e.max}{" "}
                                {e.unit}
                                {e.unilateral ? " each side" : ""} — {e.cues}
                              </p>
                            ))}
                          </div>
                        ))}
                        <p className="whitespace-pre-line">
                          {definition.finish}
                        </p>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
            {!plans.some((p) => p.title === starterWorkoutTitle) && (
              <Button
                variant="ghost"
                className="h-auto! min-h-8 justify-start! whitespace-normal! px-1! text-left font-normal text-muted"
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
                <Plus aria-hidden="true" className="size-4 shrink-0" />
                Add six-week A/B/C starter plan
              </Button>
            )}
          </section>
          <section className="min-w-0">
            <h2 className="flex items-center gap-2 py-3 font-semibold">
              <History aria-hidden="true" className="size-4" />
              Your history
            </h2>
            {!sessions.length && loaded && (
              <p className="py-2 text-sm text-muted">
                No sessions yet. Showing up is the goal.
              </p>
            )}
            <ul className="divide-y divide-border">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left text-sm outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
                    onClick={() => setSelectedSession(s.id)}
                  >
                    {s.status === "completed" && (
                      <Check
                        aria-hidden="true"
                        className="size-3.5 text-muted"
                      />
                    )}
                    <span>
                      {workoutSnapshotSchema.parse(s.snapshot).workout.name}
                      {s.lowEnergy ? " · Low energy" : ""}
                    </span>
                    <span className="ml-auto text-xs text-muted">
                      {s.completedOn ??
                        new Date(s.createdAt ?? 0).toLocaleDateString()}{" "}
                      · {s.status}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
