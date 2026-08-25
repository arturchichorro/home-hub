import {
  recipeImageDeliveryCapabilityLifetimeSeconds,
  signRecipeImageDeliveryCapability,
} from "@home-hub/shared/recipe-image-delivery";
import { describe, expect, it, vi } from "vitest";
import {
  handleRecipeImageDeliveryRequest,
  type ImageDeliveryEnv,
} from "./index";

const nowSeconds = 1_787_625_600;
const secret = "test-image-delivery-secret-at-least-32-bytes";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const recipeId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const imageId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";
const objectKey = `households/${householdId}/recipes/${recipeId}/${imageId}`;

async function signedRequest(variant: "card" | "thumbnail" | "viewer") {
  const capability = {
    expiresAt: nowSeconds + recipeImageDeliveryCapabilityLifetimeSeconds,
    householdId,
    imageId,
    recipeId,
    variant,
  };
  const signature = await signRecipeImageDeliveryCapability({
    capability,
    secret,
  });
  return new Request(
    `https://images.example/recipe-images/${variant}/${householdId}/${recipeId}/${imageId}?expires=${capability.expiresAt}&signature=${signature}`,
  );
}

function createHarness({ cached }: { cached?: Response } = {}) {
  const outputResponse = new Response("transformed-webp", {
    headers: { "Content-Type": "image/webp" },
  });
  const output = vi.fn(async () => ({ response: () => outputResponse }));
  const transform = vi.fn(() => ({ output, transform }));
  const input = vi.fn(() => ({ output, transform }));
  const get = vi.fn(async () => ({ body: new Blob(["original"]).stream() }));
  const match = vi.fn(async (_request: Request) => cached);
  const put = vi.fn(async () => undefined);
  const waitUntil = vi.fn();
  const env: ImageDeliveryEnv = {
    IMAGE_DELIVERY_SIGNING_SECRET: secret,
    IMAGES: { input },
    RECIPE_IMAGES: { get },
  };

  return {
    cache: { match, put },
    context: { waitUntil },
    env,
    get,
    input,
    match,
    output,
    put,
    transform,
    waitUntil,
  };
}

describe("recipe image delivery Worker", () => {
  it("authorizes, reads the private original, transforms a fixed variant, and caches it", async () => {
    const harness = createHarness();
    const response = await handleRecipeImageDeliveryRequest({
      ...harness,
      nowSeconds,
      request: await signedRequest("thumbnail"),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=300");
    expect(harness.get).toHaveBeenCalledWith(objectKey);
    expect(harness.transform).toHaveBeenCalledWith({
      width: 480,
      height: 480,
      fit: "cover",
    });
    expect(harness.output).toHaveBeenCalledWith({
      format: "image/webp",
      quality: 82,
    });
    expect((harness.match.mock.calls[0]?.[0] as Request | undefined)?.url).toBe(
      `https://images.example/recipe-images/thumbnail/${householdId}/${recipeId}/${imageId}?transform=webp-q82-v1`,
    );
    expect(harness.waitUntil).toHaveBeenCalledOnce();
  });

  it("validates authorization before returning an edge-cached derivative", async () => {
    const cached = new Response("cached", {
      headers: { "Content-Type": "image/webp" },
    });
    const harness = createHarness({ cached });
    const request = await signedRequest("card");

    const response = await handleRecipeImageDeliveryRequest({
      ...harness,
      nowSeconds,
      request,
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("cached");
    expect(harness.get).not.toHaveBeenCalled();

    const tamperedUrl = new URL(request.url);
    tamperedUrl.pathname = tamperedUrl.pathname.replace("/card/", "/viewer/");
    const denied = await handleRecipeImageDeliveryRequest({
      ...harness,
      nowSeconds,
      request: new Request(tamperedUrl),
    });
    expect(denied.status).toBe(403);
  });

  it("rejects original, arbitrary, expired, and non-GET requests without reading R2", async () => {
    const harness = createHarness();
    const signed = await signedRequest("viewer");
    const expired = await handleRecipeImageDeliveryRequest({
      ...harness,
      nowSeconds: nowSeconds + recipeImageDeliveryCapabilityLifetimeSeconds,
      request: signed,
    });
    expect(expired.status).toBe(403);

    const originalUrl = new URL(signed.url.replace("/viewer/", "/original/"));
    const original = await handleRecipeImageDeliveryRequest({
      ...harness,
      nowSeconds,
      request: new Request(originalUrl),
    });
    expect(original.status).toBe(400);

    const method = await handleRecipeImageDeliveryRequest({
      ...harness,
      nowSeconds,
      request: new Request(signed, { method: "POST" }),
    });
    expect(method.status).toBe(405);
    expect(harness.get).not.toHaveBeenCalled();
  });
});
