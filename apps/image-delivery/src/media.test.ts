import {
  type MediaIdentity,
  type MediaReadCapability,
  mediaOriginalObjectKey,
  mediaReadUrl,
  signMediaCapability,
} from "@home-hub/shared/media-delivery";
import { describe, expect, it, vi } from "vitest";
import {
  handleMediaImageDeliveryRequest,
  handleMediaImageProcessingRequest,
  type ImageDeliveryEnv,
} from "./index";
import { readImageBytes, validateStillImage } from "./still-image";

const nowSeconds = 1_787_625_600;
const secret = "media-worker-test-secret-of-at-least-32-bytes";
const identity: MediaIdentity = {
  householdId: "d92e5c4e-1c68-4942-9cc9-710207661bca",
  mediaId: "671874b1-df9d-4a91-8f3c-8055473e8aa2",
  storageRecipeId: null,
  moduleKey: "recipes",
  parentId: "8d46a4c4-4845-4a6d-a937-139633ae1bb9",
  attachmentId: "5944cb0d-931a-4723-b981-77eacb122314",
};
const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6O1sAAAAASUVORK5CYII=",
  ),
  (char) => char.charCodeAt(0),
);

function webp(type: string, flags = 0) {
  const data = new Uint8Array(38);
  const view = new DataView(data.buffer);
  const write = (offset: number, text: string) =>
    data.set(new TextEncoder().encode(text), offset);
  write(0, "RIFF");
  view.setUint32(4, 30, true);
  write(8, "WEBP");
  write(12, type);
  view.setUint32(16, 10, true);
  data[20] = flags;
  write(30, "VP8 ");
  view.setUint32(34, 0, true);
  return data;
}

function harness({
  source = png,
  cached = false,
  stored = true,
}: {
  source?: Uint8Array<ArrayBuffer>;
  cached?: boolean;
  stored?: boolean;
} = {}) {
  const output = vi.fn(async () => ({
    response: () =>
      new Response("webp", { headers: { "Content-Type": "image/webp" } }),
  }));
  const transform = vi.fn(() => ({ transform, output }));
  const input = vi.fn(() => ({ transform, output }));
  const get = vi.fn(async (key: string) =>
    key.includes("/derivatives/")
      ? stored
        ? { body: new Blob(["stored-webp"]).stream() }
        : null
      : { body: new Blob([source]).stream() },
  );
  const store = vi.fn(async () => undefined);
  const match = vi.fn(async (_key: Request) =>
    cached ? new Response("cached-webp") : undefined,
  );
  const put = vi.fn(async () => undefined);
  const jobs: Promise<unknown>[] = [];
  const context = { waitUntil: (job: Promise<unknown>) => jobs.push(job) };
  const env: ImageDeliveryEnv = {
    IMAGE_DELIVERY_SIGNING_SECRET: secret,
    RECIPE_IMAGES: { get, put: store },
    IMAGES: { input },
  };
  return {
    env,
    context,
    cache: { match, put },
    get,
    store,
    input,
    match,
    jobs,
  };
}
async function readRequest(patch: Partial<MediaReadCapability> = {}) {
  const capability = {
    ...identity,
    variant: "thumbnail" as const,
    expiresAt: nowSeconds + 3600,
    ...patch,
  };
  return new Request(
    mediaReadUrl({
      baseUrl: "https://images.example",
      capability,
      signature: await signMediaCapability({
        capability,
        secret,
        purpose: "read",
      }),
    }),
  );
}
async function processRequest({
  source = png,
  contentType = "image/png" as const,
  identity: inputIdentity = identity,
}: {
  source?: Uint8Array;
  contentType?: "image/png" | "image/webp" | "image/jpeg";
  identity?: MediaIdentity;
} = {}) {
  const capability = {
    ...inputIdentity,
    expiresAt: nowSeconds + 300,
    contentType,
    byteSize: source.length,
  };
  return new Request("https://images.example/internal/media/images/process", {
    method: "POST",
    body: JSON.stringify({
      ...capability,
      signature: await signMediaCapability({
        capability,
        secret,
        purpose: "process",
      }),
    }),
  });
}

describe("generic media image delivery", () => {
  it.each([null, identity.mediaId])(
    "reads generic/legacy objects with independent attachment context: %s",
    async (storageRecipeId) => {
      const h = harness();
      const response = await handleMediaImageDeliveryRequest({
        ...h,
        request: await readRequest({ storageRecipeId }),
        nowSeconds,
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe(
        "private, max-age=3600",
      );
      expect(h.get).toHaveBeenCalledWith(
        mediaOriginalObjectKey({ ...identity, storageRecipeId }) +
          "/derivatives/thumbnail.webp",
      );
      expect(h.input).not.toHaveBeenCalled();
      await Promise.all(h.jobs);
    },
  );
  it("repairs legacy missing derivatives without moving the original", async () => {
    const h = harness({ stored: false });
    const response = await handleMediaImageDeliveryRequest({
      ...h,
      request: await readRequest({ storageRecipeId: identity.parentId }),
      nowSeconds,
    });
    expect(response.status).toBe(200);
    expect(h.get).toHaveBeenCalledWith(
      mediaOriginalObjectKey({
        ...identity,
        storageRecipeId: identity.parentId,
      }),
    );
    await Promise.all(h.jobs);
    expect(h.store).toHaveBeenCalledOnce();
  });
  it("authenticates before a cache hit and rejects expired or tampered capabilities", async () => {
    for (const request of [
      await readRequest({ expiresAt: nowSeconds }),
      new Request(
        (await readRequest()).url.replace("signature=", "signature=0"),
      ),
    ]) {
      const h = harness({ cached: true });
      expect(
        (await handleMediaImageDeliveryRequest({ ...h, request, nowSeconds }))
          .status,
      ).toBe(403);
      expect(h.match).not.toHaveBeenCalled();
      expect(h.get).not.toHaveBeenCalled();
    }
  });
  it("partitions the cache by asset, layout and fixed transform", async () => {
    const keys: string[] = [];
    for (const patch of [
      {},
      { mediaId: identity.parentId },
      { storageRecipeId: identity.parentId },
      { variant: "viewer" as const },
    ]) {
      const h = harness({ cached: true });
      expect(
        (
          await handleMediaImageDeliveryRequest({
            ...h,
            request: await readRequest(patch),
            nowSeconds,
          })
        ).status,
      ).toBe(200);
      keys.push(h.match.mock.calls[0]?.[0].url ?? "");
    }
    expect(new Set(keys).size).toBe(4);
  });
  it("rejects arbitrary variants, extra fields and unsupported methods", async () => {
    const request = await readRequest();
    for (const patch of [
      { variant: "original" },
      { objectKey: "private/source" },
    ]) {
      const url = new URL(request.url);
      const capability = JSON.parse(url.searchParams.get("capability") ?? "");
      url.searchParams.set(
        "capability",
        JSON.stringify({ ...capability, ...patch }),
      );
      const h = harness();
      expect(
        (
          await handleMediaImageDeliveryRequest({
            ...h,
            request: new Request(url),
            nowSeconds,
          })
        ).status,
      ).toBe(400);
      expect(h.get).not.toHaveBeenCalled();
    }
    const h = harness();
    expect(
      (
        await handleMediaImageDeliveryRequest({
          ...h,
          request: new Request(request.url, { method: "POST" }),
          nowSeconds,
        })
      ).status,
    ).toBe(405);
  });
});

describe("generic media processing", () => {
  it.each([null, identity.parentId])(
    "validates a bounded snapshot and stores both derivatives: %s",
    async (storageRecipeId) => {
      const h = harness();
      const response = await handleMediaImageProcessingRequest({
        ...h,
        request: await processRequest({
          identity: { ...identity, storageRecipeId },
        }),
        nowSeconds,
      });
      expect(response.status).toBe(204);
      expect(h.get).toHaveBeenCalledOnce();
      expect(h.input).toHaveBeenCalledTimes(2);
      expect(h.store).toHaveBeenCalledTimes(2);
    },
  );
  it.each([webp("VP8X", 2), webp("ANIM"), webp("ANMF")])(
    "rejects animated WebP before transforming/writing",
    async (source) => {
      const h = harness({ source });
      const response = await handleMediaImageProcessingRequest({
        ...h,
        request: await processRequest({ source, contentType: "image/webp" }),
        nowSeconds,
      });
      expect(response.status).toBe(422);
      expect(h.input).not.toHaveBeenCalled();
      expect(h.store).not.toHaveBeenCalled();
    },
  );
  it("rejects type spoofing, truncated containers and size mismatches", async () => {
    for (const source of [
      new TextEncoder().encode("GIF89a"),
      png.slice(0, 20),
      new Uint8Array([...png, 0]),
    ]) {
      const h = harness({ source });
      expect(
        (
          await handleMediaImageProcessingRequest({
            ...h,
            request: await processRequest({ source }),
            nowSeconds,
          })
        ).status,
      ).toBe(422);
      expect(h.store).not.toHaveBeenCalled();
    }
    const h = harness({ source: png.slice(0, 20) });
    expect(
      (
        await handleMediaImageProcessingRequest({
          ...h,
          request: await processRequest(),
          nowSeconds,
        })
      ).status,
    ).toBe(422);
  });
  it("rejects bad processing signatures without reading storage", async () => {
    const signed = await processRequest();
    const body = (await signed.json()) as Record<string, unknown>;
    const h = harness();
    const request = new Request(signed.url, {
      method: "POST",
      body: JSON.stringify({ ...body, byteSize: 4 }),
    });
    expect(
      (await handleMediaImageProcessingRequest({ ...h, request, nowSeconds }))
        .status,
    ).toBe(403);
    expect(h.get).not.toHaveBeenCalled();
  });
});

describe("still image probing", () => {
  it("accepts PNG, JPEG headers and non-animated WebP containers for subsequent decoding", () => {
    expect(() => validateStillImage(png, "image/png")).not.toThrow();
    expect(() =>
      validateStillImage(new Uint8Array([255, 216, 255, 217]), "image/jpeg"),
    ).not.toThrow();
    expect(() => validateStillImage(webp("VP8X"), "image/webp")).not.toThrow();
  });
  it("rejects APNG chunks even though the MIME type is image/png", () => {
    const apng = new Uint8Array(png.length + 12);
    apng.set(png.subarray(0, png.length - 12));
    apng.set(new TextEncoder().encode("acTL"), png.length - 8);
    apng.set(png.subarray(png.length - 12), png.length);
    expect(() => validateStillImage(apng, "image/png")).toThrow();
  });
  it("cancels oversized streams before accumulating unbounded bytes", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(100));
      },
      cancel,
    });
    await expect(readImageBytes(body, 10)).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
