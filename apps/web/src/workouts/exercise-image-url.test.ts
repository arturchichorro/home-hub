import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearExerciseImageUrlCache,
  invalidateExerciseImageUrl,
  prefetchExerciseImage,
} from "./exercise-image-url";
import {
  batchExerciseImageUrl,
  type ExerciseImageIdentity,
} from "./exercise-media-api";

vi.mock("./exercise-media-api", () => ({ batchExerciseImageUrl: vi.fn() }));
const identity: ExerciseImageIdentity = {
  accessToken: "token",
  userId: "user",
  householdId: "household",
  exerciseId: "exercise",
  attachmentId: "attachment",
  variant: "thumbnail",
};
beforeEach(() => {
  clearExerciseImageUrlCache();
  vi.mocked(batchExerciseImageUrl).mockReset();
  vi.mocked(batchExerciseImageUrl).mockResolvedValue({
    kind: "success",
    url: "https://images.example/photo",
    expiresInSeconds: 3600,
  });
});
afterEach(() => clearExerciseImageUrlCache());
describe("exercise media URL cache", () => {
  it("deduplicates repeated catalog/slot reads for the same shared movement", async () => {
    await Promise.all([
      prefetchExerciseImage(identity),
      prefetchExerciseImage({ ...identity }),
      prefetchExerciseImage(identity),
    ]);
    await prefetchExerciseImage(identity);
    expect(batchExerciseImageUrl).toHaveBeenCalledOnce();
  });
  it("partitions users, households, exercises, attachments and variants", async () => {
    for (const patch of [
      {},
      { userId: "another-user" },
      { householdId: "another-household" },
      { exerciseId: "another-exercise" },
      { attachmentId: "another-attachment" },
      { variant: "viewer" as const },
    ]) {
      await prefetchExerciseImage({ ...identity, ...patch });
    }
    expect(batchExerciseImageUrl).toHaveBeenCalledTimes(6);
  });
  it("invalidates every variant on removal and prevents stale pending reads repopulating cache", async () => {
    let finish:
      | ((value: {
          kind: "success";
          url: string;
          expiresInSeconds: number;
        }) => void)
      | undefined;
    vi.mocked(batchExerciseImageUrl).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = prefetchExerciseImage(identity);
    invalidateExerciseImageUrl(identity);
    finish?.({
      kind: "success",
      url: "https://images.example/old",
      expiresInSeconds: 3600,
    });
    await pending;
    await prefetchExerciseImage(identity);
    expect(batchExerciseImageUrl).toHaveBeenCalledTimes(2);
    await prefetchExerciseImage({ ...identity, variant: "viewer" });
    invalidateExerciseImageUrl(identity);
    await prefetchExerciseImage({ ...identity, variant: "viewer" });
    expect(batchExerciseImageUrl).toHaveBeenCalledTimes(4);
  });
  it("clears capabilities on logout", async () => {
    await prefetchExerciseImage(identity);
    clearExerciseImageUrlCache(identity.userId);
    await prefetchExerciseImage(identity);
    expect(batchExerciseImageUrl).toHaveBeenCalledTimes(2);
  });
});
