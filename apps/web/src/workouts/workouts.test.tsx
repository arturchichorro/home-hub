import { starterWorkoutPlan } from "@home-hub/shared/workout-seed";
import { workoutSnapshotSchema } from "@home-hub/shared/workouts";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanEditor } from "./plan-editor";
import { type Session, WorkoutSession } from "./workout-session";
import { WorkoutsPage } from "./workouts-page";

const { useQuery, useZeroMutationEnabled } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useZeroMutationEnabled: vi.fn(),
}));
vi.mock("@rocicorp/zero/react", () => ({
  useZero: () => ({ userID: "me", mutate: vi.fn() }),
  useQuery,
}));
vi.mock("../zero/use-zero-mutation-enabled", () => ({
  useZeroMutationEnabled,
}));
const snapshot = workoutSnapshotSchema.parse({
  workout: starterWorkoutPlan.workouts[0],
  warmup: starterWorkoutPlan.warmup,
  finish: starterWorkoutPlan.finish,
  guidance: starterWorkoutPlan.guidance,
  incrementKg: null,
});
function session(lowEnergy = false): Session {
  return {
    id: crypto.randomUUID(),
    householdId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    cycleId: crypto.randomUUID(),
    workoutId: snapshot.workout.id,
    snapshot,
    lowEnergy,
    status: "active",
    note: "",
    completedOn: null,
    completedAt: null,
    createdAt: Date.parse("2026-10-26T07:00:00Z"),
    sets: [],
  };
}
function renderSession(s: Session, disabled = false) {
  return renderToStaticMarkup(
    <WorkoutSession
      session={s}
      previousSessions={[]}
      disabled={disabled}
      firstWeek
      onSaveSet={async () => true}
      onAction={async () => true}
      onClose={() => {}}
    />,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  useQuery.mockReset();
  useZeroMutationEnabled.mockReturnValue(true);
});
describe("guided workouts", () => {
  it("renders exercises in pair/round order, with warm-up, mobility, safety, and twelve set forms", () => {
    const html = renderSession(session());
    expect(html.match(/<form/g) ?? []).length(12);
    const first = html.indexOf("Goblet squat"),
      press = html.indexOf("Dumbbell bench press");
    expect(press).toBeGreaterThan(first);
    expect(html.indexOf("Goblet squat", first + 1)).toBeGreaterThan(press);
    expect(html).toContain("Kiné");
    expect(html).toContain("3–4 clean");
    expect(html).toContain("Skip set");
    expect(html).toContain("Private log");
    expect(
      html.match(
        /<button[^>]*disabled=""[^>]*><span[^>]*>Complete session/,
      )?.[0],
    ).toBeDefined();
  });
  it("low-energy sessions prescribe one round, not twelve sets", () => {
    const html = renderSession(session(true));
    expect(html.match(/<form/g) ?? []).length(6);
    expect(html).toContain("Low energy");
    expect(html).not.toContain("Round 2");
  });
  it("disables logging when disconnected and for abandoned sessions", () => {
    expect(
      renderSession(session(), true).match(/<fieldset disabled=""/g) ?? [],
    ).length(12);
    const abandoned = { ...session(), status: "abandoned" as const };
    const html = renderSession(abandoned);
    expect(html.match(/<fieldset disabled=""/g) ?? []).length(12);
    expect(html).not.toContain(">Complete session");
  });
  it("completed sessions keep editable sets and omit the completion command", () => {
    const s = {
      ...session(),
      status: "completed" as const,
      completedAt: Date.now(),
      completedOn: "2026-10-26",
    };
    const html = renderSession(s);
    expect(html).not.toContain(">Complete session");
    expect(html).not.toContain('<fieldset disabled=""');
  });
  it("provides a structured plan editor, not a JSON textarea", () => {
    const html = renderToStaticMarkup(
      <PlanEditor
        initial={starterWorkoutPlan}
        initialTitle="Starter"
        disabled={false}
        onSave={async () => true}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain("Load convention");
    expect(html).toContain("Technique cues");
    expect(html).toContain("Move workout earlier");
    expect(html).toContain("Smallest available increase");
    expect(html).toContain("Add exercise");
  });
});
describe("workout dashboard", () => {
  it("offers the supplied plan and explains private logging", () => {
    useQuery.mockReturnValue([[], { type: "complete" }]);
    const html = renderToStaticMarkup(
      <WorkoutsPage householdId={crypto.randomUUID()} />,
    );
    expect(html).toContain("Add six-week A/B/C starter plan");
    expect(html).toContain("Your sessions and performance stay private");
    expect(html).toContain("0 / 3 sessions");
  });
  it("does not offer mutation controls as enabled before initial queries complete", () => {
    useQuery.mockReturnValue([[], { type: "unknown" }]);
    const html = renderToStaticMarkup(
      <WorkoutsPage householdId={crypto.randomUUID()} />,
    );
    expect(html).toContain("Loading workouts");
    expect(
      html.match(/<button[^>]*disabled=""[^>]*><span[^>]*>Create plan/)?.[0],
    ).toBeDefined();
  });
  it("shows query failure and offline read-only feedback", () => {
    useQuery.mockReturnValue([[], { type: "error" }]);
    useZeroMutationEnabled.mockReturnValue(false);
    const html = renderToStaticMarkup(
      <WorkoutsPage householdId={crypto.randomUUID()} />,
    );
    expect(html).toContain("Unable to load workouts");
    expect(html).toContain("Read-only while disconnected");
  });
});
