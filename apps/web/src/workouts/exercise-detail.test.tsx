import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { ExerciseDetailPage } from "./exercise-detail";

const mocks = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock("@rocicorp/zero/react", () => ({
  useQuery: mocks.useQuery,
  useZero: () => ({ mutate: vi.fn() }),
}));
vi.mock("../zero/use-zero-mutation-enabled", () => ({
  useZeroMutationEnabled: () => true,
}));
vi.mock("./exercise-catalog", () => ({
  CatalogExerciseEditor: () => <div>Catalog editor</div>,
}));
vi.mock("./training-history", () => ({
  TrainingHistoryPage: () => <div>Private history</div>,
}));
const id = "10000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
});
it("retains editing/history with one canonical query and no statistics", () => {
  mocks.useQuery.mockReturnValue([
    {
      id,
      name: "Squat",
      unit: "reps",
      load: "bodyweight",
      unilateral: false,
      deletedAt: null,
    },
    { type: "complete" },
  ]);
  const html = renderToStaticMarkup(
    <ExerciseDetailPage householdId={id} exerciseId={id} />,
  );
  expect(html).toContain("Catalog editor");
  expect(html).toContain("Private history");
  expect(html).not.toMatch(/statistics|Lifetime|Loading statistics/i);
  expect(mocks.useQuery).toHaveBeenCalledOnce();
});
it("retains retired history without reintroducing catalog editing or statistics", () => {
  mocks.useQuery.mockReturnValue([
    {
      id,
      name: "Squat",
      unit: "reps",
      load: "bodyweight",
      unilateral: false,
      deletedAt: 1,
    },
    { type: "complete" },
  ]);
  const html = renderToStaticMarkup(
    <ExerciseDetailPage householdId={id} exerciseId={id} />,
  );
  expect(html).toContain("Removed from catalog");
  expect(html).toContain("Private history");
  expect(html).not.toContain("Catalog editor");
  expect(html).not.toMatch(/statistics/i);
});
