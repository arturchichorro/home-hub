import {
  parseVideoRange,
  signVideoCapability,
  type VideoReadCapability,
  videoReadUrl,
} from "@home-hub/shared/video-delivery";
import { expect, it, vi } from "vitest";
import { handleVideoRequest } from "./video";

const secret = "isolated-video-test-signing-secret-123456",
  now = 1000;
const c: VideoReadCapability = {
  householdId: crypto.randomUUID(),
  mediaId: crypto.randomUUID(),
  storageRecipeId: null,
  moduleKey: "lists",
  parentId: crypto.randomUUID(),
  attachmentId: crypto.randomUUID(),
  videoVersion: "a".repeat(64),
  contentType: "video/mp4",
  expiresAt: 1100,
};
async function request(headers?: HeadersInit, method = "GET") {
  return new Request(
    videoReadUrl(
      "https://media.invalid",
      c,
      await signVideoCapability(c, secret),
    ),
    { method, ...(headers ? { headers } : {}) },
  );
}
function environment() {
  const bytes = new TextEncoder().encode("abcdefghij");
  return {
    IMAGE_DELIVERY_SIGNING_SECRET: secret,
    RECIPE_IMAGES: {
      head: vi.fn(async () => ({ size: 10, httpEtag: '"fixture"' })),
      get: vi.fn(
        async (
          _key: string,
          options?: { range: { offset: number; length: number } },
        ) => ({
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(
                options
                  ? bytes.slice(
                      options.range.offset,
                      options.range.offset + options.range.length,
                    )
                  : bytes,
              );
              controller.close();
            },
          }),
        }),
      ),
    },
  };
}
it("serves authenticated byte ranges without buffering/caching a complete clip", async () => {
  const env = environment(),
    response = await handleVideoRequest(
      await request({ Range: "bytes=2-5" }),
      env,
      now,
    );
  expect(response.status).toBe(206);
  expect(response.headers.get("Content-Range")).toBe("bytes 2-5/10");
  expect(response.headers.get("Content-Length")).toBe("4");
  expect(await response.text()).toBe("cdef");
  expect(env.RECIPE_IMAGES.get.mock.calls[0]?.[0]).toContain(
    `/video/${"a".repeat(64)}/playback.mp4`,
  );
});
it("handles HEAD, suffix ranges, unsatisfiable and multi-range requests", async () => {
  const env = environment(),
    head = await handleVideoRequest(await request(undefined, "HEAD"), env, now);
  expect(head.status).toBe(200);
  expect(env.RECIPE_IMAGES.get).not.toHaveBeenCalled();
  expect(
    await (
      await handleVideoRequest(await request({ Range: "bytes=-2" }), env, now)
    ).text(),
  ).toBe("ij");
  for (const value of ["bytes=99-", "bytes=2-1", "bytes=0-1,3-4"]) {
    const response = await handleVideoRequest(
      await request({ Range: value }),
      env,
      now,
    );
    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe("bytes */10");
  }
});
it("checks signature and expiry before any storage access", async () => {
  const env = environment(),
    good = await request(),
    url = new URL(good.url);
  url.searchParams.set(
    "capability",
    JSON.stringify({ ...c, parentId: crypto.randomUUID() }),
  );
  expect((await handleVideoRequest(new Request(url), env, now)).status).toBe(
    403,
  );
  expect((await handleVideoRequest(good, env, 1200)).status).toBe(403);
  expect(env.RECIPE_IMAGES.head).not.toHaveBeenCalled();
  expect(env.RECIPE_IMAGES.get).not.toHaveBeenCalled();
});
it("validates range arithmetic including unsafe integers", () => {
  expect(parseVideoRange("bytes=0-", 10)).toEqual({ offset: 0, length: 10 });
  expect(parseVideoRange("bytes=0-999", 10)).toEqual({ offset: 0, length: 10 });
  for (const range of [
    "bytes=-0",
    "bytes=-",
    "bytes=9007199254740992-",
    "banana",
    "bytes=3-2",
  ])
    expect(parseVideoRange(range, 10)).toBeUndefined();
});
