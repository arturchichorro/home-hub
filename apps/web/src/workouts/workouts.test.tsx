import { starterWorkouts } from "@home-hub/shared/workout-seed";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkoutDetail } from "./workout-detail";
import { WorkoutExercises } from "./workout-fields";
import type { WorkoutLog } from "./workout-log";
import { WorkoutsLibrary } from "./workouts-library";

const { useQuery, enabled, header, mutate } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  enabled: vi.fn(),
  header: vi.fn(),
  mutate: vi.fn(),
}));
vi.mock("@rocicorp/zero/react", () => ({
  useZero: () => ({ mutate }),
  useQuery,
}));
vi.mock("../zero/use-zero-mutation-enabled", () => ({
  useZeroMutationEnabled: enabled,
}));
vi.mock("../app-header-right-component", () => ({
  useAppHeaderRightComponent: header,
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({
    children,
    params,
  }: {
    children: ReactNode;
    params: { workoutId: string };
  }) => createElement("a", { href: `/workouts/${params.workoutId}` }, children),
}));
const householdId = crypto.randomUUID(),
  workoutId = crypto.randomUUID();
const starter = starterWorkouts[0];
if (!starter) throw new Error("seed");
const workout = { id: workoutId, householdId, ...starter };
beforeEach(() => {
  vi.clearAllMocks();
  useQuery.mockReset();
  enabled.mockReturnValue(true);
  mutate.mockReturnValue({
    client: Promise.resolve({ type: "success" }),
    server: Promise.resolve({ type: "success" }),
  });
});
describe("simple workouts", () => {
  it("lists standalone linked workouts, without plans or instruction text", () => {
    useQuery.mockReturnValue([[workout], { type: "complete" }]);
    const html = renderToStaticMarkup(
      <WorkoutsLibrary householdId={householdId} />,
    );
    expect(html).toContain(`/workouts/${workoutId}`);
    expect(html).toContain("Workout A");
    expect(html).not.toContain("Shared plans");
    expect(html).not.toContain("Monday–Sunday");
    expect(html).not.toContain("six-week cycle");
    expect(renderToStaticMarkup(header.mock.calls.at(-1)?.[0])).toContain(
      "Add workout",
    );
  });
  it("has one notes field and a one-click Done action even without logged sets", async () => {
    useQuery
      .mockReturnValueOnce([workout, { type: "complete" }])
      .mockReturnValueOnce([[], { type: "complete" }]);
    const html = renderToStaticMarkup(
      <WorkoutDetail householdId={householdId} workoutId={workoutId} />,
    );
    expect(html.match(/<textarea/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Notes"');
    expect(html.indexOf('aria-label="Notes"')).toBeGreaterThan(
      html.lastIndexOf("Name for Dead bug"),
    );
    expect(html).not.toContain("Logging options");
    expect(html).not.toContain('aria-label="Save exercises"');
    expect(html).not.toContain("Unsaved exercises");
    expect(html).not.toMatch(/<summary[^>]*>Notes<\/summary>/);
    expect(html).not.toContain("Program instructions");
    expect(html).not.toContain("Smallest available increase");
    expect(html).not.toContain("Shared plan");
    const action = header.mock.calls.at(-1)?.[0];
    expect(renderToStaticMarkup(action)).toContain("Done");
    expect(action.props.disabled).toBe(false);
    action.props.onClick();
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.objectContaining({ action: "complete", workoutId }),
      }),
    );
  });
  it("uses a Base UI measure select and a settings-icon menu", () => {
    useQuery
      .mockReturnValueOnce([workout, { type: "complete" }])
      .mockReturnValueOnce([[], { type: "complete" }]);
    const html = renderToStaticMarkup(
      <WorkoutDetail householdId={householdId} workoutId={workoutId} />,
    );
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-label="Measure for Goblet squat"');
    expect(html).toContain('aria-label="Settings for Goblet squat"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).not.toContain("<select");
  });
  it("labels unfinished logs as drafts, not completed workouts", () => {
    useQuery
      .mockReturnValueOnce([workout, { type: "complete" }])
      .mockReturnValueOnce([
        [
          {
            id: "draft",
            snapshot: starter,
            sets: [],
            status: "active",
            createdAt: Date.now(),
            completedOn: null,
          },
        ],
        { type: "complete" },
      ]);
    const html = renderToStaticMarkup(
      <WorkoutDetail householdId={householdId} workoutId={workoutId} />,
    );
    expect(html).toContain("Resume draft");
    expect(html).toContain("Draft");
    expect(html).not.toContain("In progress");
  });
  it("disables Done while disconnected", () => {
    enabled.mockReturnValue(false);
    useQuery
      .mockReturnValueOnce([workout, { type: "complete" }])
      .mockReturnValueOnce([[], { type: "complete" }]);
    renderToStaticMarkup(
      <WorkoutDetail householdId={householdId} workoutId={workoutId} />,
    );
    expect(header.mock.calls.at(-1)?.[0].props.disabled).toBe(true);
  });
  it("keeps logging to weight/reps and a save checkmark", () => {
    const log: WorkoutLog = {
      id: crypto.randomUUID(),
      householdId,
      userId: crypto.randomUUID(),
      workoutId,
      snapshot: starter,
      status: "active",
      createdAt: Date.now(),
      completedAt: null,
      completedOn: null,
      sets: [],
      note: "",
    };
    const html = renderToStaticMarkup(
      <WorkoutExercises
        current={starter.exercises}
        disabled={false}
        onSave={async () => true}
        onStartLogging={async () => {}}
        onCloseLogging={() => {}}
        onCompleteLogging={() => {}}
        resume={false}
        logging={{ log, previous: [], onSave: async () => true }}
      />,
    );
    expect(html.match(/<form/g)).toHaveLength(12);
    expect(html).toContain('aria-label="Save Goblet squat, set 1"');
    expect(html).not.toContain("Rest timer");
    expect(html).not.toContain("Good form, no symptoms");
    expect(html).not.toContain("Reps in reserve");
    expect(html).not.toMatch(/<summary[^>]*>Notes<\/summary>/);
    expect(html).toContain('data-exercise-id="');
    expect(html).toContain('aria-label="Close log"');
    expect(html).toContain("Done</span>");
    expect(html).toContain(
      'aria-label="Left reps for Bench-supported one-arm row, set 1"',
    );
    expect(html).toContain(
      'aria-label="Right reps for Bench-supported one-arm row, set 1"',
    );
    expect(html).toContain("Blank uses the left-side value");
    expect(html).not.toContain("reps left");
    expect(html).toContain('aria-label="Name for Goblet squat"');
    expect(html).not.toContain("Back to workout");
  });
  it("does not offer Done again while viewing a completed log", () => {
    const log: WorkoutLog = {
      id: crypto.randomUUID(),
      householdId,
      userId: crypto.randomUUID(),
      workoutId,
      snapshot: starter,
      status: "completed",
      createdAt: Date.now(),
      completedAt: Date.now(),
      completedOn: "2026-10-25",
      sets: [],
      note: "",
    };
    const html = renderToStaticMarkup(
      <WorkoutExercises
        current={starter.exercises}
        disabled={false}
        onSave={async () => true}
        onStartLogging={async () => {}}
        onCloseLogging={() => {}}
        onCompleteLogging={() => {}}
        resume={false}
        logging={{ log, previous: [], onSave: async () => true }}
      />,
    );
    const buttons = [...html.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)].map(
      (m) => m[0],
    );
    expect(buttons.some((button) => button.includes("Done</span>"))).toBe(
      false,
    );
  });
  it("shows actual set details directly in history, including empty logs", () => {
    const exercise = starter.exercises[1];
    if (!exercise) throw new Error("seed");
    const entry = {
      id: "history",
      status: "completed",
      completedOn: "2026-10-25",
      createdAt: Date.now(),
      snapshot: starter,
      sets: [1, 2].map((round) => ({
        logId: "history",
        exerciseId: exercise.id,
        round,
        values: { weightKg: 8, amount: 10, rightAmount: null },
      })),
    };
    useQuery
      .mockReturnValueOnce([workout, { type: "complete" }])
      .mockReturnValueOnce([
        [entry, { ...entry, id: "empty", sets: [] }],
        { type: "complete" },
      ]);
    const html = renderToStaticMarkup(
      <WorkoutDetail householdId={householdId} workoutId={workoutId} />,
    );
    expect(html).toContain("2 × 10 reps · 8 kg/hand");
    expect(html).toContain("No sets logged.");
  });
  it("shows the starter option only for an empty library", () => {
    useQuery.mockReturnValue([[], { type: "complete" }]);
    const html = renderToStaticMarkup(
      <WorkoutsLibrary householdId={householdId} />,
    );
    expect(html).toContain("Add A/B/C workouts");
  });
  it("reports query failures", () => {
    useQuery
      .mockReturnValueOnce([undefined, { type: "error" }])
      .mockReturnValueOnce([[], { type: "complete" }]);
    expect(
      renderToStaticMarkup(
        <WorkoutDetail householdId={householdId} workoutId={workoutId} />,
      ),
    ).toContain("Unable to load workout.");
  });
});
