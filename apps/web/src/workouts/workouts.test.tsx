import { starterWorkouts } from "@home-hub/shared/workout-seed";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkoutDetail } from "./workout-detail";
import { WorkoutExercises } from "./workout-fields";
import type { WorkoutLog } from "./workout-log";
import { openWorkoutLog } from "./workout-log-form";
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
  it("does not offer a completion shortcut while just browsing a workout", () => {
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
    expect(header.mock.calls.at(-1)?.[0]).toBeNull();
    expect(html).not.toContain("Done</span>");
    expect(html).toContain("Log workout");
    expect(html).not.toMatch(/<h2[^>]*>Exercises<\/h2>/);
    const heading = html.slice(
      html.indexOf("data-workout-heading"),
      html.indexOf("<fieldset"),
    );
    expect(heading).toContain('aria-label="Workout name"');
    expect(heading).toContain("Log workout");
    expect(heading).toMatch(/lucide-plus[\s\S]*Add exercise/);
    expect(mutate).not.toHaveBeenCalled();
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
  it("has no draft or resume state", () => {
    useQuery
      .mockReturnValueOnce([workout, { type: "complete" }])
      .mockReturnValueOnce([[], { type: "complete" }]);
    const html = renderToStaticMarkup(
      <WorkoutDetail householdId={householdId} workoutId={workoutId} />,
    );
    expect(html).not.toContain("Draft");
    expect(html).not.toContain("Resume");
    expect(html).not.toContain("In progress");
  });
  it("disables starting a log while disconnected", () => {
    enabled.mockReturnValue(false);
    useQuery
      .mockReturnValueOnce([workout, { type: "complete" }])
      .mockReturnValueOnce([[], { type: "complete" }]);
    const html = renderToStaticMarkup(
      <WorkoutDetail householdId={householdId} workoutId={workoutId} />,
    );
    const start = [...html.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)]
      .map((m) => m[0])
      .find((button) => button.includes("Log workout"));
    expect(start).toContain('disabled=""');
    expect(header.mock.calls.at(-1)?.[0]).toBeNull();
  });
  it("keeps new inputs local until Done, without per-set save buttons", () => {
    const html = renderToStaticMarkup(
      <WorkoutExercises
        current={starter.exercises}
        disabled={false}
        onSave={async () => true}
        onStartLogging={async () => {}}
        onCloseLogging={() => {}}
        onCompleteLogging={() => {}}
        logging={{
          form: openWorkoutLog(starter),
          previous: [],
          onChange: () => {},
        }}
      />,
    );
    expect(html.match(/aria-label="Log [^"]+, set [0-9]+"/g)).toHaveLength(12);
    expect(html).not.toContain("<form");
    expect(html).not.toContain('aria-label="Save ');
    expect(html).not.toContain("Rest timer");
    expect(html).not.toContain("Reps in reserve");
    expect(html).toContain('aria-label="Cancel log"');
    expect(html).toContain("Done</span>");
    expect(html).toContain(
      'aria-label="Left reps for Bench-supported one-arm row, set 1"',
    );
    expect(html).toContain(
      'aria-label="Right reps for Bench-supported one-arm row, set 1"',
    );
    expect(html).toContain("Blank uses the left-side value");
    expect(html).not.toContain("reps left");
    expect(mutate).not.toHaveBeenCalled();
  });
  it("commits history edits to the same log with Done", () => {
    const log: WorkoutLog = {
      id: crypto.randomUUID(),
      householdId,
      userId: crypto.randomUUID(),
      workoutId,
      snapshot: starter,
      createdAt: Date.now(),
      completedAt: Date.now(),
      completedOn: "2026-10-25",
      sets: [],
      note: "",
    };
    const form = openWorkoutLog(starter, log);
    const html = renderToStaticMarkup(
      <WorkoutExercises
        current={starter.exercises}
        disabled={false}
        onSave={async () => true}
        onStartLogging={async () => {}}
        onCloseLogging={() => {}}
        onCompleteLogging={() => {}}
        logging={{ form, previous: [], onChange: () => {} }}
      />,
    );
    expect(form.id).toBe(log.id);
    expect(html).toContain("Done</span>");
    expect(html).toContain("2026-10-25");
    expect(mutate).not.toHaveBeenCalled();
  });
  it("shows actual set details directly in history, including empty logs", () => {
    const exercise = starter.exercises[1];
    if (!exercise) throw new Error("seed");
    const entry = {
      id: "history",
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
    const historyRows = [
      ...html.matchAll(
        /<button[^>]*aria-pressed="[^"]*"[^>]*>[\s\S]*?<\/button>/g,
      ),
    ].map((match) => match[0]);
    expect(historyRows).toHaveLength(2);
    for (const row of historyRows) {
      expect(row).not.toContain("hover:text-primary");
      expect(row).not.toContain("aria-pressed:text-primary");
      expect(row).not.toContain("Done");
      expect(row).toContain("lucide-check");
    }
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
