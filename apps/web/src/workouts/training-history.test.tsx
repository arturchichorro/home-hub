import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
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
