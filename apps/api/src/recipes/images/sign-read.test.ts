import { describe, expect, it } from "vitest";
import {
  recipeImageReadUrlLifetimeSeconds,
  signRecipeImageRead,
} from "./sign-read";

const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const recipeId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const imageId = "5944cb0d-931a-4723-b981-77eacb122314";
const secret = "test-image-delivery-secret-at-least-32-bytes";

describe("signRecipeImageRead", () => {
  it("targets one fixed variant with a short-lived capability URL", async () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    const signedUrl = await signRecipeImageRead({
      baseUrl: "https://images.home.example/base/",
      householdId,
      imageId,
      now,
      recipeId,
      secret,
      variant: "thumbnail",
    });
    const url = new URL(signedUrl);

    expect(url.pathname).toBe(
      `/base/recipe-images/thumbnail/${householdId}/${recipeId}/${imageId}`,
    );
    expect(url.searchParams.get("expires")).toBe(
      String(
        Math.floor(now.getTime() / 1_000) + recipeImageReadUrlLifetimeSeconds,
      ),
    );
    expect(url.searchParams.get("signature")).toMatch(/^[0-9a-f]{64}$/u);
    expect(signedUrl).not.toContain(secret);
  });
});
