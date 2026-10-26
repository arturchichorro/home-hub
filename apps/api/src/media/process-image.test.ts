import {
  mediaReadCapabilitySchema,
  verifyMediaCapability,
} from "@home-hub/shared/media-delivery";
import { describe, expect, it, vi } from "vitest";
import { recipeImageMediaIdentity } from "../recipes/images/media-identity";
import { InvalidMediaUploadError, processMediaImage } from "./process-image";
import { signMediaRead } from "./sign-read";

const now = new Date("2026-08-25T12:00:00Z");
const secret = "media-service-secret-at-least-32-bytes-long";
const input = {
  householdId: "d92e5c4e-1c68-4942-9cc9-710207661bca",
  recipeId: "8d46a4c4-4845-4a6d-a937-139633ae1bb9",
  imageId: "5944cb0d-931a-4723-b981-77eacb122314",
  mediaId: "671874b1-df9d-4a91-8f3c-8055473e8aa2",
  objectKey:
    "households/d92e5c4e-1c68-4942-9cc9-710207661bca/recipes/671874b1-df9d-4a91-8f3c-8055473e8aa2/671874b1-df9d-4a91-8f3c-8055473e8aa2",
};
const identity = recipeImageMediaIdentity(input);

describe("feature-neutral media services", () => {
  it("keeps storage provenance separate from the authorizing recipe/attachment", async () => {
    const url = new URL(
      await signMediaRead({
        baseUrl: "https://images.example",
        identity,
        now,
        secret,
        variant: "viewer",
      }),
    );
    const capability = mediaReadCapabilitySchema.parse(
      JSON.parse(url.searchParams.get("capability") ?? ""),
    );
    expect(capability).toMatchObject({
      storageRecipeId: input.mediaId,
      parentId: input.recipeId,
      attachmentId: input.imageId,
      mediaId: input.mediaId,
      moduleKey: "recipes",
    });
    expect(
      await verifyMediaCapability({
        capability,
        signature: url.searchParams.get("signature") ?? "",
        secret,
        purpose: "read",
        nowSeconds: now.getTime() / 1000,
      }),
    ).toBe(true);
  });
  it("signs processing metadata and uses the generic Worker endpoint", async () => {
    const fetchRequest = vi.fn(async () => new Response(null, { status: 204 }));
    await processMediaImage({
      baseUrl: "https://images.example",
      identity,
      now,
      secret,
      contentType: "image/webp",
      byteSize: 42,
      fetchRequest,
    });
    const [url, options] = fetchRequest.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.pathname).toBe("/internal/media/images/process");
    const { signature, ...capability } = JSON.parse(options.body as string);
    expect(
      await verifyMediaCapability({
        capability,
        signature,
        secret,
        purpose: "process",
        nowSeconds: now.getTime() / 1000,
      }),
    ).toBe(true);
  });
  it("distinguishes unsupported content from retryable processing failures", async () => {
    const base = {
      baseUrl: "https://images.example",
      identity,
      now,
      secret,
      contentType: "image/webp",
      byteSize: 42,
    };
    await expect(
      processMediaImage({
        ...base,
        fetchRequest: async () => new Response(null, { status: 422 }),
      }),
    ).rejects.toBeInstanceOf(InvalidMediaUploadError);
    await expect(
      processMediaImage({
        ...base,
        fetchRequest: async () => new Response(null, { status: 500 }),
      }),
    ).rejects.toThrow("processing failed");
  });
});
