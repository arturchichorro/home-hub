import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCalendarImageUrlCache,
  invalidateCalendarImageUrl,
  prefetchCalendarImage,
} from "./calendar-image-url";
import {
  batchCalendarImageUrl,
  type CalendarImageIdentity,
} from "./calendar-media-api";

vi.mock("./calendar-media-api", () => ({ batchCalendarImageUrl: vi.fn() }));

const identity: CalendarImageIdentity = {
  accessToken: "token",
  userId: "user",
  householdId: "household",
  itemId: "item",
  attachmentId: "attachment",
  variant: "thumbnail",
};

beforeEach(() => {
  clearCalendarImageUrlCache();
  vi.mocked(batchCalendarImageUrl).mockReset();
  vi.mocked(batchCalendarImageUrl).mockResolvedValue({
    kind: "success",
    url: "https://images.example/photo",
    expiresInSeconds: 3600,
  });
});

afterEach(() => clearCalendarImageUrlCache());

describe("calendar media URL cache", () => {
  it("deduplicates repeated reads for the same calendar picture", async () => {
    await Promise.all([
      prefetchCalendarImage(identity),
      prefetchCalendarImage({ ...identity }),
      prefetchCalendarImage(identity),
    ]);
    await prefetchCalendarImage(identity);
    expect(batchCalendarImageUrl).toHaveBeenCalledOnce();
  });
  it("partitions users, households, items, attachments and variants", async () => {
    for (const patch of [
      {},
      { userId: "another-user" },
      { householdId: "another-household" },
      { itemId: "another-item" },
      { attachmentId: "another-attachment" },
      { variant: "viewer" as const },
    ]) {
      await prefetchCalendarImage({ ...identity, ...patch });
    }

    expect(batchCalendarImageUrl).toHaveBeenCalledTimes(6);
  });
  it("invalidates every variant on removal and prevents stale pending reads repopulating cache", async () => {
    let finish:
      | ((value: {
          kind: "success";
          url: string;
          expiresInSeconds: number;
        }) => void)
      | undefined;
    vi.mocked(batchCalendarImageUrl).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );

    const pending = prefetchCalendarImage(identity);
    invalidateCalendarImageUrl(identity);
    finish?.({
      kind: "success",
      url: "https://images.example/old",
      expiresInSeconds: 3600,
    });
    await pending;
    await prefetchCalendarImage(identity);
    expect(batchCalendarImageUrl).toHaveBeenCalledTimes(2);
    await prefetchCalendarImage({ ...identity, variant: "viewer" });
    invalidateCalendarImageUrl(identity);
    await prefetchCalendarImage({ ...identity, variant: "viewer" });
    expect(batchCalendarImageUrl).toHaveBeenCalledTimes(4);
  });
  it("clears capabilities on logout", async () => {
    await prefetchCalendarImage(identity);
    clearCalendarImageUrlCache(identity.userId);
    await prefetchCalendarImage(identity);
    expect(batchCalendarImageUrl).toHaveBeenCalledTimes(2);
  });
});
