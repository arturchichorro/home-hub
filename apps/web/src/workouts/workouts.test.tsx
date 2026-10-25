import { starterWorkouts } from "@home-hub/shared/workout-seed";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkoutDetail } from "./workout-detail";
import { type WorkoutLog, WorkoutLogView } from "./workout-log";
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
  it("uses labelled Base UI selects for exercise measures and loads", () => {
    useQuery
      .mockReturnValueOnce([workout, { type: "complete" }])
      .mockReturnValueOnce([[], { type: "complete" }]);
    const html = renderToStaticMarkup(
      <WorkoutDetail householdId={householdId} workoutId={workoutId} />,
    );
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-label="Measure for Goblet squat"');
    expect(html).toContain('aria-label="Load for Goblet squat"');
    expect(html).not.toContain("<select");
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
    };
    const html = renderToStaticMarkup(
      <WorkoutLogView
        log={log}
        previous={[]}
        disabled={false}
        onSave={async () => true}
        onClose={() => {}}
      />,
    );
    expect(html.match(/<form/g)).toHaveLength(12);
    expect(html).toContain('aria-label="Save Goblet squat, set 1"');
    expect(html).not.toContain("Rest timer");
    expect(html).not.toContain("Good form, no symptoms");
    expect(html).not.toContain("Reps in reserve");
    expect(html).not.toMatch(/<summary[^>]*>Notes<\/summary>/);
    expect(html).toContain("No forced wrist stretching.");
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
