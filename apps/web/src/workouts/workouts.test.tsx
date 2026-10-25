import { starterWorkoutPlan } from "@home-hub/shared/workout-seed";
import { workoutSnapshotSchema } from "@home-hub/shared/workouts";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanEditor } from "./plan-editor";
import { type Session, WorkoutSession } from "./workout-session";
import { WorkoutsPage } from "./workouts-page";

const { useQuery, useZeroMutationEnabled, header } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useZeroMutationEnabled: vi.fn(),
  header: vi.fn(),
}));
vi.mock("@rocicorp/zero/react", () => ({
  useZero: () => ({ userID: "me", mutate: vi.fn() }),
  useQuery,
}));
vi.mock("../zero/use-zero-mutation-enabled", () => ({
  useZeroMutationEnabled,
}));
vi.mock("../app-header-right-component", () => ({
  useAppHeaderRightComponent: header,
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
function button(html: string, label: string) {
  return [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
    .map((m) => m[0])
    .find((markup) => markup.includes(label));
}
beforeEach(() => {
  vi.clearAllMocks();
  useQuery.mockReset();
  useZeroMutationEnabled.mockReturnValue(true);
});
describe("guided workouts", () => {
  it("renders quiet set rows in pair/round order, preserving warm-up, mobility, safety, and twelve set forms", () => {
    const html = renderSession(session());
    const forms = [...html.matchAll(/<form aria-label="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(forms).toHaveLength(12);
    expect(forms.slice(0, 4)).toEqual([
      "Log Goblet squat, set 1",
      "Log Dumbbell bench press, set 1",
      "Log Goblet squat, set 2",
      "Log Dumbbell bench press, set 2",
    ]);
    expect(html).toContain("Kiné");
    expect(html).toContain("3–4 clean");
    expect(html).toContain("Private log");
    expect(html).toContain('aria-label="Save Goblet squat, set 1"');
    expect(html).toContain('aria-label="Options for Goblet squat, set 1"');
    expect(button(html, "Complete session")).toContain('disabled=""');
    expect(html).not.toContain("rounded-md border border-border p-3");
  });
  it("low-energy sessions prescribe one round, not twelve sets", () => {
    const html = renderSession(session(true));
    expect(html.match(/<form/g) ?? []).toHaveLength(6);
    expect(html).toContain("Low energy");
    expect(html).not.toContain("Round 2");
  });
  it("disables logging when disconnected and for abandoned sessions", () => {
    useZeroMutationEnabled.mockReturnValue(false);
    const html = renderSession(session(), true);
    expect(html.match(/<fieldset disabled=""/g) ?? []).toHaveLength(12);
    expect(
      html.match(/<textarea[^>]*aria-label="Session note"[^>]*>/)?.[0],
    ).toContain('disabled=""');
    const abandoned = renderSession({ ...session(), status: "abandoned" });
    expect(abandoned.match(/<fieldset disabled=""/g) ?? []).toHaveLength(12);
    expect(button(abandoned, "Complete session")).toBeUndefined();
  });
  it("completed sessions keep editable sets and omit completion/abandon commands", () => {
    const html = renderSession({
      ...session(),
      status: "completed",
      completedAt: Date.now(),
      completedOn: "2026-10-26",
    });
    expect(button(html, "Complete session")).toBeUndefined();
    expect(html).not.toContain('aria-label="Abandon session"');
    expect(html).not.toContain('<fieldset disabled=""');
  });
  it("uses a seamless session note instead of a conventional form and save button", () => {
    const html = renderSession(session());
    const note = html.match(
      /<textarea[^>]*aria-label="Session note"[^>]*>/,
    )?.[0];
    expect(note).toContain("bg-transparent");
    expect(html).not.toContain('aria-label="Save session note"');
  });
  it("provides seamless plan/exercise editing, named icon actions, and optional technique settings", () => {
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
    expect(
      html.match(/<input[^>]*aria-label="Plan title"[^>]*>/)?.[0],
    ).toContain("bg-transparent");
    expect(html).toContain('aria-label="Remove Goblet squat from Workout A"');
    expect(html).not.toContain("rounded-lg border border-border p-4");
  });
});
describe("workout dashboard", () => {
  it("offers the supplied plan and explains private logging without a duplicate module heading", () => {
    useQuery.mockReturnValue([[], { type: "complete" }]);
    const html = renderToStaticMarkup(
      <WorkoutsPage householdId={crypto.randomUUID()} />,
    );
    expect(html).toContain("Add six-week A/B/C starter plan");
    expect(html).toContain("Your sessions and performance stay private");
    expect(html).toContain("0 / 3 sessions");
    expect(html).not.toContain("<h1");
    expect(renderToStaticMarkup(header.mock.calls.at(-1)?.[0])).toContain(
      "Add plan",
    );
  });
  it("disables the app-header create action before initial queries complete", () => {
    useQuery.mockReturnValue([[], { type: "unknown" }]);
    const html = renderToStaticMarkup(
      <WorkoutsPage householdId={crypto.randomUUID()} />,
    );
    expect(html).toContain("Loading workouts");
    expect(
      button(renderToStaticMarkup(header.mock.calls.at(-1)?.[0]), "Add plan"),
    ).toContain('disabled=""');
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
