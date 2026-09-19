import type { Database } from "@home-hub/database";
import {
  householdMembers,
  householdModuleSettings,
  recipeImages,
  recipes,
} from "@home-hub/database/schema";
import { describe, expect, it, vi } from "vitest";
import { createDeleteRecipeImageService } from "./delete";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const recipeId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const imageId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";
const objectKey = `households/${householdId}/recipes/${recipeId}/${imageId}`;
const input = { userId, householdId, recipeId, imageId };

function createFakeDatabase({
  user = true,
  membership = true,
  module = true,
  image = true,
  updateReturnsRow = true,
}: {
  user?: boolean;
  membership?: boolean;
  module?: boolean;
  image?: boolean;
  updateReturnsRow?: boolean;
} = {}) {
  const results = [
    membership ? { id: "membership-id" } : undefined,
    module ? { householdId } : undefined,
    image ? { objectKey } : undefined,
  ];
  const tables: unknown[] = [];
  const lockStrengths: unknown[] = [];
  const select = vi.fn(() => {
    const builder = {
      from: (table: unknown) => {
        tables.push(table);
        return builder;
      },
      where: () => builder,
      limit: () => builder,
      for: async (strength: unknown) => {
        lockStrengths.push(strength);
        const result = results.shift();
        return result ? [result] : [];
      },
    };
    return builder;
  });
  const returning = vi.fn(async () =>
    updateReturnsRow ? [{ id: imageId }] : [],
  );
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const update = vi.fn((table: unknown) => {
    tables.push(table);
    return { set };
  });
  const tx = {
    query: {
      users: {
        findFirst: vi.fn(async () => (user ? { id: userId } : undefined)),
      },
    },
    select,
    update,
  };
  const transaction = vi.fn(
    async <T>(operation: (transaction: typeof tx) => Promise<T>) =>
      operation(tx),
  );

  return {
    db: { transaction } as unknown as Database,
    lockStrengths,
    set,
    tables,
    transaction,
    update,
  };
}

describe("delete recipe image service", () => {
  it("soft-deletes metadata without removing retained image objects", async () => {
    const { db, lockStrengths, set, tables, transaction, update } =
      createFakeDatabase();

    await expect(
      createDeleteRecipeImageService({ db })(input),
    ).resolves.toEqual({ kind: "success" });

    expect(transaction).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith({
      deletedAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
    expect(lockStrengths).toEqual(["share", "share", "update"]);
    expect(tables).toEqual([
      householdMembers,
      householdModuleSettings,
      recipeImages,
      recipes,
      recipeImages,
    ]);
  });

  it.each([
    [{ user: false }, "unauthorized"],
    [{ membership: false }, "forbidden"],
    [{ module: false }, "forbidden"],
  ] as const)("rejects missing access", async (options, kind) => {
    const { db, update } = createFakeDatabase(options);

    await expect(
      createDeleteRecipeImageService({ db })(input),
    ).resolves.toEqual({ kind });
    expect(update).not.toHaveBeenCalled();
  });

  it("treats missing or already-deleted metadata as an idempotent success", async () => {
    const { db, update } = createFakeDatabase({ image: false });

    await expect(
      createDeleteRecipeImageService({ db })(input),
    ).resolves.toEqual({ kind: "success" });
    expect(update).not.toHaveBeenCalled();
  });

  it("throws if locked metadata unexpectedly cannot be updated", async () => {
    const { db } = createFakeDatabase({ updateReturnsRow: false });

    await expect(createDeleteRecipeImageService({ db })(input)).rejects.toThrow(
      "Recipe image deletion returned no row",
    );
  });
});
