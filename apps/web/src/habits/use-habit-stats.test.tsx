import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { useHabitStats } from "./use-habit-stats";

const mocks = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock("@rocicorp/zero/react", () => ({ useQuery: mocks.useQuery }));
const id = "10000000-0000-4000-8000-000000000001";
let current: ReturnType<typeof useHabitStats>;
function Capture() {
  current = useHabitStats(id, id, id, "2027-01-10", true);
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
it("reacts to Zero rollups directly without fetch, focus refresh or revision counters", () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("No stats HTTP"));
  const week = {
    weekOn: "2027-01-04",
    completedMask: 1,
    completedDays: 1,
    lastOn: "2027-01-04",
    runLength: 1,
    bestWeeks: 1,
  };
  mocks.useQuery.mockReturnValue([
    { weeklyStatistics: [week] },
    { type: "complete" },
  ]);
  const hook = render();
  expect(hook.result.current.data?.completedDays).toBe(1);
  mocks.useQuery.mockReturnValue([
    {
      weeklyStatistics: [
        { ...week, completedMask: 3, completedDays: 2, lastOn: "2027-01-05" },
      ],
    },
    { type: "complete" },
  ]);
  hook.result.current = render().result.current;
  expect(hook.result.current.data).toMatchObject({
    completedDays: 2,
    last7: 2,
    lastOn: "2027-01-05",
  });

  expect(fetch).not.toHaveBeenCalled();
  mocks.useQuery.mockReturnValue([undefined, { type: "complete" }]);
  hook.result.current = render().result.current;
  expect(hook.result.current.data).toBeUndefined();
  expect(hook.result.current.error).toBeTruthy();
});
it("does not fabricate zero statistics before an authorized query completes", () => {
  mocks.useQuery.mockReturnValue([undefined, { type: "unknown" }]);
  const hook = render();
  expect(hook.result.current).toEqual({ data: undefined, error: undefined });
});
