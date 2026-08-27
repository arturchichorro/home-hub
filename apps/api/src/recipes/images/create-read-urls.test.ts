import type { Database } from "@home-hub/database";
import { describe, expect, it, vi } from "vitest";
import { createRecipeImageReadUrlsService } from "./create-read-urls";
import { recipeImageReadUrlLifetimeSeconds } from "./sign-read";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const recipeId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const imageId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";

function createFakeDatabase({ user = true }: { user?: boolean } = {}) {
  const results = [
    [{ id: "membership-id" }],
    [{ householdId }],
    [{ id: imageId, recipeId }],
  ];
  const select = vi.fn(() => {
    const result = results.shift() ?? [];
    const builder = {
      from: (_table: unknown) => builder,
      where: (_condition: unknown) => builder,
      limit: (_limit: unknown) => builder,
      for: async (_strength: unknown) => result,
    };
    return builder;
  });
  const tx = {
    query: {
      users: {
        findFirst: vi.fn(async () => (user ? { id: userId } : undefined)),
      },
    },
    select,
  };
  const transaction = vi.fn(
    async <T>(operation: (transaction: typeof tx) => Promise<T>) =>
      operation(tx),
  );
  return { db: { transaction } as unknown as Database, transaction };
}

describe("create recipe image read URLs service", () => {
  it("authorizes once, omits missing images, and signs unique requests", async () => {
    const { db, transaction } = createFakeDatabase();
    const signRead = vi.fn(
      async ({ imageId: signedImageId, variant }) =>
        `https://images.example/${variant}/${signedImageId}`,
    );
    const missingImageId = "7581fc9c-7acf-47b7-ad4b-9bcc1001cc67";

    await expect(
      createRecipeImageReadUrlsService({ db, signRead })({
        userId,
        householdId,
        requests: [
          { imageId, recipeId, variant: "thumbnail" },
          { imageId, recipeId, variant: "thumbnail" },
          { imageId: missingImageId, recipeId, variant: "viewer" },
        ],
      }),
    ).resolves.toEqual({
      kind: "success",
      reads: [
        {
          imageId,
          recipeId,
          variant: "thumbnail",
          url: `https://images.example/thumbnail/${imageId}`,
          expiresInSeconds: recipeImageReadUrlLifetimeSeconds,
        },
      ],
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(signRead).toHaveBeenCalledOnce();
  });

  it("does not sign when the user is inactive", async () => {
    const { db } = createFakeDatabase({ user: false });
    const signRead = vi.fn(async () => "https://images.example/signed");

    await expect(
      createRecipeImageReadUrlsService({ db, signRead })({
        userId,
        householdId,
        requests: [{ imageId, recipeId, variant: "thumbnail" }],
      }),
    ).resolves.toEqual({ kind: "unauthorized" });
    expect(signRead).not.toHaveBeenCalled();
  });
});
