import { emptyExerciseStats } from "@home-hub/shared/exercise-stats";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { useExerciseStats } from "./use-exercise-stats";

const mocks = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock("@rocicorp/zero/react", () => ({ useQuery: mocks.useQuery }));
const id = "10000000-0000-4000-8000-000000000001";
let current: ReturnType<typeof useExerciseStats>;
function Capture() {
  current = useExerciseStats(id, id);
  return null;
}
function render() {
  renderToStaticMarkup(<Capture />);
  return { result: { current } };
}
beforeEach(() => {
  vi.restoreAllMocks();
  mocks.useQuery.mockReset();
});
it("uses reactive author-scoped metadata, including a genuinely empty active catalog exercise", () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("No stats HTTP"));
  mocks.useQuery.mockReturnValue([{ statistics: [] }, { type: "complete" }]);
  const hook = render();
  expect(hook.result.current.data).toEqual(emptyExerciseStats);
  mocks.useQuery.mockReturnValue([
    {
      statistics: [{ stats: { ...emptyExerciseStats, sessions: 2, sets: 3 } }],
    },
    { type: "complete" },
  ]);
  hook.result.current = render().result.current;
  expect(hook.result.current.data).toMatchObject({ sessions: 2, sets: 3 });

  expect(fetch).not.toHaveBeenCalled();
  mocks.useQuery.mockReturnValue([undefined, { type: "complete" }]);
  hook.result.current = render().result.current;
  expect(hook.result.current.data).toBeUndefined();
  expect(hook.result.current.error).toBeTruthy();
});
it("fails closed for malformed persisted JSON instead of displaying invented totals", () => {
  mocks.useQuery.mockReturnValue([
    { statistics: [{ stats: { sets: -1 } }] },
    { type: "complete" },
  ]);
  const hook = render();
  expect(hook.result.current.data).toBeUndefined();
  expect(hook.result.current.error).toBeTruthy();
});
