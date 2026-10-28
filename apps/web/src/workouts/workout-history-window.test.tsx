import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { WorkoutDetail } from "./workout-detail";

const { useQuery } = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock("@rocicorp/zero/react", () => ({
  useQuery,
  useZero: () => ({ userID: "me", mutate: vi.fn(), run: vi.fn() }),
}));
vi.mock("../zero/use-zero-mutation-enabled", () => ({
  useZeroMutationEnabled: () => true,
}));
vi.mock("../app-header-right-component", () => ({
  useAppHeaderRightComponent: vi.fn(),
}));
vi.mock("./workout-fields", () => ({
  WorkoutText: () => null,
  WorkoutExercises: () => null,
}));
vi.mock("./workout-history-entry", () => ({
  WorkoutHistoryEntry: ({ entry }: { entry: { id: string } }) => (
    <li data-history-id={entry.id} />
  ),
}));
beforeEach(() => vi.clearAllMocks());
const ids = {
  householdId: "d92e5c4e-1c68-4942-9cc9-710207661bca",
  workoutId: "cf8e0455-182d-4c35-aab0-7c45d9009852",
};
it("renders 20 initial logs and a load-older action without exposing the sentinel", () => {
  useQuery
    .mockReturnValueOnce([
      { title: "Read", exercises: [] },
      { type: "complete" },
    ])
    .mockReturnValueOnce([
      Array.from({ length: 21 }, (_, i) => ({ id: String(i), sets: [] })),
      { type: "complete" },
    ]);
  const html = renderToStaticMarkup(<WorkoutDetail {...ids} />);
  expect(html.match(/data-history-id=/g)).toHaveLength(20);
  expect(html).not.toContain('data-history-id="20"');
  expect(html).toContain("Load older workouts");
  expect(useQuery).toHaveBeenCalledTimes(2);
});
it("does not advertise more history when the window is exhausted", () => {
  useQuery
    .mockReturnValueOnce([
      { title: "Read", exercises: [] },
      { type: "complete" },
    ])
    .mockReturnValueOnce([[], { type: "complete" }]);
  expect(renderToStaticMarkup(<WorkoutDetail {...ids} />)).not.toContain(
    "Load older workouts",
  );
});
it("offers an error retry without dropping the workout itself", () => {
  useQuery
    .mockReturnValueOnce([
      { title: "Read", exercises: [] },
      { type: "complete" },
    ])
    .mockReturnValueOnce([[], { type: "error", retry: vi.fn() }]);
  const html = renderToStaticMarkup(<WorkoutDetail {...ids} />);
  expect(html).toContain("Unable to load history");
  expect(html).toContain("<article");
  expect(html).toContain("Retry");
});
