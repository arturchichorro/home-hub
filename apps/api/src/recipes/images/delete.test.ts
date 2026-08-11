import type { Database } from "@home-hub/database";
import {
  householdMembers,
  householdModuleSettings,
  recipeImages,
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
  users = [true, true],
  memberships = [true, true],
  modules = [true, true],
  images = [objectKey, objectKey],
  deleteReturnsRow = true,
  events = [],
}: {
  users?: readonly boolean[];
  memberships?: readonly boolean[];
  modules?: readonly boolean[];
  images?: ReadonlyArray<string | null>;
  deleteReturnsRow?: boolean;
  events?: string[];
} = {}) {
  const userResults = [...users];
  const selectResults: unknown[] = [];
  for (
    let index = 0;
    index < Math.max(memberships.length, modules.length, images.length);
    index += 1
  ) {
    selectResults.push(
      memberships[index] ? { id: "membership-id" } : undefined,
      modules[index] ? { householdId } : undefined,
      images[index] ? { objectKey: images[index] } : undefined,
    );
  }

  const tables: unknown[] = [];
  const lockStrengths: unknown[] = [];
  const findUser = vi.fn(async () =>
    userResults.shift() ? { id: userId } : undefined,
  );
  const select = vi.fn((_selection: unknown) => {
    const result = selectResults.shift();
    const builder = {
      from: (table: unknown) => {
        tables.push(table);
        return builder;
      },
      where: (_condition: unknown) => builder,
      limit: (_limit: unknown) => builder,
      for: async (strength: unknown) => {
        lockStrengths.push(strength);
        return result ? [result] : [];
      },
    };
    return builder;
  });
  const deleteRow = vi.fn((table: unknown) => {
    tables.push(table);
    return {
      where: (_condition: unknown) => ({
        returning: async () => (deleteReturnsRow ? [{ id: imageId }] : []),
      }),
    };
  });
  const tx = {
    query: { users: { findFirst: findUser } },
    select,
    delete: deleteRow,
  };
  const transaction = vi.fn(
    async <T>(operation: (transaction: typeof tx) => Promise<T>) => {
      events.push("transaction:start");
      const result = await operation(tx);
      events.push("transaction:end");
      return result;
    },
  );

  return {
    db: { transaction } as unknown as Database,
    deleteRow,
    lockStrengths,
    tables,
    transaction,
  };
}

describe("delete recipe image service", () => {
  it("deletes R2 outside transactions before deleting locked metadata", async () => {
    const events: string[] = [];
    const { db, deleteRow, lockStrengths, tables, transaction } =
      createFakeDatabase({ events });
    const deleteObject = vi.fn(async () => {
      events.push("object:delete");
    });

    await expect(
      createDeleteRecipeImageService({ db, deleteObject })(input),
    ).resolves.toEqual({ kind: "success" });

    expect(events).toEqual([
      "transaction:start",
      "transaction:end",
      "object:delete",
      "transaction:start",
      "transaction:end",
    ]);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(deleteObject).toHaveBeenCalledWith({ objectKey });
    expect(deleteRow).toHaveBeenCalledOnce();
    expect(lockStrengths).toEqual([
      "share",
      "share",
      "share",
      "share",
      "share",
      "update",
    ]);
    expect(tables).toEqual([
      householdMembers,
      householdModuleSettings,
      recipeImages,
      householdMembers,
      householdModuleSettings,
      recipeImages,
      recipeImages,
    ]);
  });

  it.each([
    [{ users: [false] }, "unauthorized"],
    [{ memberships: [false] }, "forbidden"],
    [{ modules: [false] }, "forbidden"],
  ] as const)(
    "does not delete when initial access is rejected",
    async (options, kind) => {
      const { db, deleteRow, transaction } = createFakeDatabase(options);
      const deleteObject = vi.fn(async () => undefined);

      await expect(
        createDeleteRecipeImageService({ db, deleteObject })(input),
      ).resolves.toEqual({ kind });
      expect(transaction).toHaveBeenCalledOnce();
      expect(deleteObject).not.toHaveBeenCalled();
      expect(deleteRow).not.toHaveBeenCalled();
    },
  );

  it("treats missing metadata as an idempotent success", async () => {
    const { db, transaction } = createFakeDatabase({ images: [null] });
    const deleteObject = vi.fn(async () => undefined);

    await expect(
      createDeleteRecipeImageService({ db, deleteObject })(input),
    ).resolves.toEqual({ kind: "success" });
    expect(transaction).toHaveBeenCalledOnce();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("leaves metadata untouched when R2 deletion fails", async () => {
    const { db, deleteRow, transaction } = createFakeDatabase();
    const error = new Error("R2 unavailable");

    await expect(
      createDeleteRecipeImageService({
        db,
        deleteObject: async () => {
          throw error;
        },
      })(input),
    ).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledOnce();
    expect(deleteRow).not.toHaveBeenCalled();
  });

  it("accepts concurrent metadata deletion idempotently", async () => {
    const { db, deleteRow, transaction } = createFakeDatabase({
      images: [objectKey, null],
    });
    const deleteObject = vi.fn(async () => undefined);

    await expect(
      createDeleteRecipeImageService({ db, deleteObject })(input),
    ).resolves.toEqual({ kind: "success" });
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(deleteObject).toHaveBeenCalledOnce();
    expect(deleteRow).not.toHaveBeenCalled();
  });

  it("rechecks authorization after deleting from R2", async () => {
    const { db, deleteRow } = createFakeDatabase({ users: [true, false] });
    const deleteObject = vi.fn(async () => undefined);

    await expect(
      createDeleteRecipeImageService({ db, deleteObject })(input),
    ).resolves.toEqual({ kind: "unauthorized" });
    expect(deleteObject).toHaveBeenCalledOnce();
    expect(deleteRow).not.toHaveBeenCalled();
  });

  it("throws when locked metadata changed before deletion", async () => {
    const { db, deleteRow } = createFakeDatabase({
      images: [objectKey, `${objectKey}-changed`],
    });

    await expect(
      createDeleteRecipeImageService({
        db,
        deleteObject: async () => undefined,
      })(input),
    ).rejects.toThrow("Recipe image changed during deletion");
    expect(deleteRow).not.toHaveBeenCalled();
  });

  it("throws if locked metadata unexpectedly cannot be deleted", async () => {
    const { db } = createFakeDatabase({ deleteReturnsRow: false });

    await expect(
      createDeleteRecipeImageService({
        db,
        deleteObject: async () => undefined,
      })(input),
    ).rejects.toThrow("Recipe image deletion returned no row");
  });
});
