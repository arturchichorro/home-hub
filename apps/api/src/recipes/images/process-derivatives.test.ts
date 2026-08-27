import { describe, expect, it, vi } from "vitest";
import { processRecipeImageDerivatives } from "./process-derivatives";

const secret = "test-image-delivery-secret-at-least-32-bytes";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const recipeId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const imageId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";

describe("processRecipeImageDerivatives", () => {
  it("sends a short-lived signed processing request", async () => {
    const fetchRequest = vi.fn(
      async (
        _input: Parameters<typeof fetch>[0],
        _init?: Parameters<typeof fetch>[1],
      ) => new Response(null, { status: 204 }),
    );

    await processRecipeImageDerivatives({
      baseUrl: "https://images.example/base/",
      fetchRequest,
      householdId,
      imageId,
      now: new Date("2026-08-26T12:00:00.000Z"),
      recipeId,
      secret,
    });

    const [url, init] = fetchRequest.mock.calls[0] ?? [];
    expect(url?.toString()).toBe(
      "https://images.example/base/internal/recipe-images/process",
    );
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ householdId, imageId, recipeId });
    expect(body.signature).toMatch(/^[0-9a-f]{64}$/u);
    expect(body.expiresAt).toBe(1_787_745_900);
  });

  it("fails confirmation when processing does not succeed", async () => {
    await expect(
      processRecipeImageDerivatives({
        baseUrl: "https://images.example",
        fetchRequest: async () => new Response(null, { status: 500 }),
        householdId,
        imageId,
        recipeId,
        secret,
      }),
    ).rejects.toThrow("Image derivative processing failed (500)");
  });
});
