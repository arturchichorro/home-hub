import { afterEach, expect, it, vi } from "vitest";
import { waitForCreatedExercise } from "./wait-for-created-exercise";

type Row = { id: string; normalizedName: string; createdAt: number | null };
function setup(initial: Row[] = []) {
  let emit: (rows: Row[], type: string) => void = () => {};
  const destroy = vi.fn();
  const materialize = vi.fn(() => ({
    destroy,
    addListener: (listener: typeof emit) => {
      emit = listener;
      listener(initial, "complete");
      return () => {};
    },
  }));
  return {
    zero: { materialize } as unknown as Parameters<
      typeof waitForCreatedExercise
    >[0],
    emit: (rows: Row[], type = "complete") => emit(rows, type),
    destroy,
  };
}
afterEach(() => vi.useRealTimers());
it("waits past optimistic rows and early server acks, then resolves a promoted stable ID", async () => {
  const { zero, emit, destroy } = setup([
    { id: "proposed", normalizedName: "row", createdAt: 0 },
  ]);
  let settled = false;
  const result = waitForCreatedExercise(
    zero,
    crypto.randomUUID(),
    "proposed",
    " Row ",
  ).then((id) => {
    settled = true;
    return id;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  emit([{ id: "another", normalizedName: "another movement", createdAt: 1 }]);
  await Promise.resolve();
  expect(settled).toBe(false);
  emit([{ id: "historical", normalizedName: "row", createdAt: 1 }]);
  expect(await result).toBe("historical");
  expect(destroy).toHaveBeenCalledOnce();
});
it("accepts an already-replicated creation and matches the proposed ID even after a concurrent rename", async () => {
  const { zero, destroy } = setup([
    { id: "proposed", normalizedName: "renamed row", createdAt: 1 },
  ]);
  expect(
    await waitForCreatedExercise(zero, crypto.randomUUID(), "proposed", "Row"),
  ).toBe("proposed");
  expect(destroy).toHaveBeenCalledOnce();
});
it("bounds pending sync and cleans up on timeout or query error", async () => {
  vi.useFakeTimers();
  const { zero, emit, destroy } = setup();
  const result = waitForCreatedExercise(
    zero,
    crypto.randomUUID(),
    "proposed",
    "Row",
  );
  await vi.advanceTimersByTimeAsync(10_000);
  expect(await result).toBeUndefined();
  expect(destroy).toHaveBeenCalledOnce();
  const second = waitForCreatedExercise(
    zero,
    crypto.randomUUID(),
    "proposed",
    "Row",
  );
  emit([], "error");
  expect(await second).toBeUndefined();
  expect(destroy).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});
