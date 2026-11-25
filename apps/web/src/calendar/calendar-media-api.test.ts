import { afterEach, describe, expect, it, vi } from "vitest";
import {
  batchCalendarImageUrl,
  type CalendarImageIdentity,
  confirmCalendarImage,
  requestCalendarImageUpload,
} from "./calendar-media-api";

const identity: CalendarImageIdentity = {
  accessToken: "test-access",
  userId: crypto.randomUUID(),
  householdId: crypto.randomUUID(),
  itemId: crypto.randomUUID(),
  attachmentId: crypto.randomUUID(),
  variant: "thumbnail",
};

afterEach(() => vi.unstubAllGlobals());

describe("calendar media API", () => {
  it("requests server-controlled uploads and validates the response", async () => {
    const response = {
      attachmentId: identity.attachmentId,
      upload: {
        url: "https://upload.example/object",
        expiresInSeconds: 300,
        requiredHeaders: { "Content-Type": "image/png" },
      },
    };
    const fetch = vi.fn(async () => Response.json(response));
    vi.stubGlobal("fetch", fetch);
    expect(
      await requestCalendarImageUpload({
        ...identity,
        contentType: "image/png",
        byteSize: 42,
        width: 1,
        height: 1,
      }),
    ).toEqual({ kind: "success", ...response });
    expect(fetch).toHaveBeenCalledWith(
      `/api/households/${identity.householdId}/calendar/items/${identity.itemId}/media/uploads`,
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-access",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentType: "image/png",
          byteSize: 42,
          width: 1,
          height: 1,
        }),
      }),
    );
  });
  it("handles invalid uploads", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 422 }));
    vi.stubGlobal("fetch", fetch);
    expect(await confirmCalendarImage(identity)).toEqual({
      kind: "invalid_upload",
    });
  });
  it("batches thumbnails across items, bounds batches and omits missing entries", async () => {
    const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
      const { requests } = JSON.parse(init.body as string);

      return Response.json({
        reads: requests
          .filter((_: unknown, i: number) => i !== 0)
          .map((request: unknown) => ({
            ...(request as object),
            url: "https://images.example/photo",
            expiresInSeconds: 3600,
          })),
      });
    });
    vi.stubGlobal("fetch", fetch);

    const results = await Promise.all(
      Array.from({ length: 101 }, (_, i) =>
        batchCalendarImageUrl({
          ...identity,
          itemId: crypto.randomUUID(),
          attachmentId: crypto.randomUUID(),
          variant: i % 2 ? "viewer" : "thumbnail",
        }),
      ),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(fetch.mock.calls[0]?.[1].body as string).requests,
    ).toHaveLength(100);
    expect(results.filter((r) => r.kind === "not_found")).toHaveLength(2);
    expect(results.filter((r) => r.kind === "success")).toHaveLength(99);
  });
  it("never batches different accounts, tokens or households together", async () => {
    const fetch = vi.fn(async () => Response.json({ reads: [] }));
    vi.stubGlobal("fetch", fetch);
    await Promise.all(
      [
        identity,
        { ...identity, userId: crypto.randomUUID() },
        { ...identity, accessToken: "refreshed" },
        { ...identity, householdId: crypto.randomUUID() },
      ].map(batchCalendarImageUrl),
    );
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it("passes authentication failures through and rejects malformed read contracts", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ reads: [{ url: "bad" }] }));
    vi.stubGlobal("fetch", fetch);
    expect(await batchCalendarImageUrl(identity)).toEqual({
      kind: "unauthorized",
    });
    await expect(batchCalendarImageUrl(identity)).rejects.toThrow();
  });
});
