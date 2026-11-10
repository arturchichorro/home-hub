import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ExerciseStatistics } from "./exercise-statistics";
import { TrainingHistoryEntry } from "./training-history";
import type { TrainingSessionRow } from "./training-log-projection";

vi.mock("@rocicorp/zero/react", () => ({
  useZero: () => ({ mutate: vi.fn() }),
}));
vi.mock("../zero/use-zero-mutation-enabled", () => ({
  useZeroMutationEnabled: () => true,
}));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: () => ({ status: "idle" }),
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string;
    params: Record<string, string>;
    children: ReactNode;
  }) => (
    <a
      {...props}
      href={Object.entries(params).reduce(
        (path, [key, value]) => path.replace(`$${key}`, value),
        to,
      )}
    >
      {children}
    </a>
  ),
}));
const householdId = crypto.randomUUID();
const exerciseId = crypto.randomUUID();
const log: TrainingSessionRow = {
  id: crypto.randomUUID(),
  householdId,
  userId: crypto.randomUUID(),
  workoutId: crypto.randomUUID(),
  name: "Frozen workout",
  note: "Private note",
  completedOn: "2026-11-09",
  completedAt: 1,
  createdAt: 1,
  deletedAt: null,
  exercises: [
    {
      id: crypto.randomUUID(),
      sessionId: "",
      householdId,
      userId: "",
      exerciseId,
      templateExerciseId: null,
      position: 0,
      name: "Frozen movement",
      unit: "reps",
      load: "bodyweight",
      unilateral: false,
      role: "warmup",
      plannedSets: 2,
      target: "8",
      performedOn: "2026-11-08",
      performedAt: 1,
      deletedAt: null,
      sets: [
        {
          sessionExerciseId: "",
          round: 1,
          amount: 8,
          rightAmount: 6,
          weightKg: 10,
          unit: "reps",
          load: "per-hand",
          unilateral: true,
        },
      ],
    },
  ],
};
const render = (today: string, exerciseOnly = false) =>
  renderToStaticMarkup(
    <TrainingHistoryEntry
      log={log}
      today={today}
      exerciseOnly={exerciseOnly}
      ready
      onDirtyChange={() => {}}
    />,
  );

it("shows actual sets, frozen roles, original occurrence dates and specific exercise/source links", () => {
  const html = render("2026-11-10");
  expect(html).toContain("Frozen workout");
  expect(html).toContain("Frozen movement");
  expect(html).toContain("Warm-up");
  expect(html).toContain("Left 8 / Right 6 reps");
  expect(html).toContain("10 kg/hand");
  expect(html).toContain("2026-11-08");
  expect(html).toContain(`workouts/exercises/${exerciseId}`);
  expect(html).toContain("Open original log");
});
it("keeps older notes read-only here without removing the original logger action", () => {
  const html = render("2026-11-10");
  expect(html).toContain("Private note");
  expect(html).not.toContain('aria-label="Log note"');
  expect(html).not.toContain("Delete");
  expect(html).not.toContain("Remove set");
});
it("allows today's private note inline but never set edits", () => {
  const html = render("2026-11-09");
  expect(html).toContain('aria-label="Log note"');
  expect(html).not.toContain("Weight in kg for");
});
it("exercise-only history omits the parent session's note and retains source context", () => {
  const html = render("2026-11-09", true);
  expect(html).not.toContain("Private note");
  expect(html).not.toContain('aria-label="Log note"');
  expect(html).toContain("Frozen workout");
  expect(html).toContain("Left 8 / Right 6 reps");
});
it("renders compact totals, side/record breakdown and real zero distinctly from missing volume", () => {
  const measure = { total: 0, left: 0, right: 0, sets: 1, unilateralSets: 1 };
  const stats = {
    sessions: 1,
    sets: 1,
    lastOn: "2026-11-09",
    reps: measure,
    seconds: measure,
    volumeKg: 0,
    unmeasuredSets: 1,
    records: [
      {
        unit: "reps" as const,
        load: "per-hand" as const,
        unilateral: true,
        weightKg: 0,
      },
    ],
  };
  const html = renderToStaticMarkup(<ExerciseStatistics stats={stats} />);
  expect(html).toContain("External-load volume");
  expect(html).toContain("0 kg");
  expect(html).toContain("Left 0 · Right 0");
  expect(html).toContain("Stats details");
  expect(html).toContain("missing weight");
  expect(html).not.toContain("<details");
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain("estimated strength");
  expect(
    renderToStaticMarkup(
      <ExerciseStatistics stats={{ ...stats, volumeKg: null }} />,
    ),
  ).toContain("Not recorded");
  expect(html).toContain("partial");
  expect(
    renderToStaticMarkup(
      <ExerciseStatistics
        stats={{ ...stats, volumeKg: null, unmeasuredSets: 0 }}
      />,
    ),
  ).not.toContain('<dt class="text-xs text-muted">External-load volume');
});
