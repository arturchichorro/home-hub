import type { Database } from "@home-hub/database";
import {
  householdMembers,
  householdModuleSettings,
  recipeImages,
  recipes,
} from "@home-hub/database/schema";
import { describe, expect, it, vi } from "vitest";
import { createConfirmRecipeImageUploadService as createConfirmRecipeImageUploadServiceBase } from "./confirm-upload";

type ConfirmServiceInput = Parameters<
  typeof createConfirmRecipeImageUploadServiceBase
>[0];

function createConfirmRecipeImageUploadService({
  processDerivatives = async () => undefined,
  ...input
}: Omit<ConfirmServiceInput, "processDerivatives"> &
  Partial<Pick<ConfirmServiceInput, "processDerivatives">>) {
  return createConfirmRecipeImageUploadServiceBase({
    ...input,
    processDerivatives,
  });
}

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const recipeId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const imageId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";
const objectKey = `households/${householdId}/recipes/${recipeId}/${imageId}`;

const input = { userId, householdId, recipeId, imageId };

const pendingImage = {
  id: imageId,
  objectKey,
  contentType: "image/webp",
  byteSize: 2_048,
  confirmedAt: null,
};

function createFakeDatabase({
  users = [true, true],
  memberships = [true, true],
  modules = [true, true],
  images = [pendingImage, pendingImage],
  updateReturnsRow = true,
}: {
  users?: boolean[];
  memberships?: boolean[];
  modules?: boolean[];
  images?: Array<
    typeof pendingImage | { id: string; confirmedAt: Date } | null
  >;
  updateReturnsRow?: boolean;
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
      images[index] ?? undefined,
    );
  }

  const tables: unknown[] = [];
  const lockStrengths: unknown[] = [];
  const updatedValues: Array<Record<string, unknown>> = [];
  const findUser = vi.fn(async () =>
    userResults.shift() ? { id: userId } : undefined,
  );

  const select = vi.fn((_selection: unknown) => {
    const builder = {
      from: (table: unknown) => {
        tables.push(table);
        return builder;
      },
      where: (_condition: unknown) => builder,
      limit: (_limit: unknown) => builder,
      for: async (strength: unknown) => {
        lockStrengths.push(strength);
        const result = selectResults.shift();
        return result ? [result] : [];
      },
    };
    return builder;
  });

  const update = vi.fn((table: unknown) => {
    tables.push(table);
    return {
      set: (values: Record<string, unknown>) => {
        updatedValues.push(values);
        return {
          where: (_condition: unknown) => ({
            returning: async () =>
              updateReturnsRow
                ? [{ id: imageId, confirmedAt: values.confirmedAt as Date }]
                : [],
          }),
        };
      },
    };
  });

  const tx = { query: { users: { findFirst: findUser } }, select, update };
  const transaction = vi.fn(
    async <T>(operation: (transaction: typeof tx) => Promise<T>) =>
      operation(tx),
  );

  return {
    db: { transaction } as unknown as Database,
    lockStrengths,
    tables,
    transaction,
    update,
    updatedValues,
  };
}

describe("confirm recipe image upload service", () => {
  it("verifies R2 outside the transactions and confirms matching metadata", async () => {
    const { db, lockStrengths, tables, transaction, updatedValues } =
      createFakeDatabase();
    const inspectObject = vi.fn(async () => ({
      contentType: "image/webp",
      byteSize: 2_048,
    }));
    const processDerivatives = vi.fn(async () => undefined);
    const confirmUpload = createConfirmRecipeImageUploadService({
      db,
      inspectObject,
      processDerivatives,
    });

    const result = await confirmUpload(input);

    expect(result).toMatchObject({ kind: "success", image: { id: imageId } });
    if (result.kind !== "success") throw new Error("Expected success");
    expect(result.image.confirmedAt).toBeInstanceOf(Date);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(inspectObject).toHaveBeenCalledWith({ objectKey });
    expect(processDerivatives).toHaveBeenCalledWith({
      householdId,
      imageId,
      recipeId,
    });
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
      recipes,
      householdMembers,
      householdModuleSettings,
      recipeImages,
      recipes,
      recipeImages,
    ]);
    expect(updatedValues).toEqual([
      {
        confirmedAt: result.image.confirmedAt,
        updatedAt: result.image.confirmedAt,
      },
    ]);
  });

  it("returns an already confirmed image without contacting R2", async () => {
    const confirmedAt = new Date("2026-08-09T12:00:00.000Z");
    const { db, transaction, update } = createFakeDatabase({
      images: [{ id: imageId, confirmedAt }],
    });
    const inspectObject = vi.fn(async () => null);

    await expect(
      createConfirmRecipeImageUploadService({ db, inspectObject })(input),
    ).resolves.toEqual({
      kind: "success",
      image: { id: imageId, confirmedAt },
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(inspectObject).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps metadata pending when the R2 object does not exist", async () => {
    const { db, transaction, update } = createFakeDatabase();
    const inspectObject = vi.fn(async () => null);

    await expect(
      createConfirmRecipeImageUploadService({ db, inspectObject })(input),
    ).resolves.toEqual({ kind: "upload_not_found" });
    expect(transaction).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps metadata pending when derivative processing fails", async () => {
    const { db, transaction, update } = createFakeDatabase();
    const inspectObject = vi.fn(async () => ({
      contentType: "image/webp",
      byteSize: 2_048,
    }));
    const error = new Error("processing unavailable");

    await expect(
      createConfirmRecipeImageUploadService({
        db,
        inspectObject,
        processDerivatives: async () => {
          throw error;
        },
      })(input),
    ).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    [{ contentType: "image/png", byteSize: 2_048 }, "content type"],
    [{ contentType: "image/webp", byteSize: 2_049 }, "byte size"],
    [{ contentType: undefined, byteSize: 2_048 }, "missing content type"],
  ] as const)("rejects mismatched R2 %s", async (object, _label) => {
    const { db, transaction, update } = createFakeDatabase();
    const inspectObject = vi.fn(async () => object);

    await expect(
      createConfirmRecipeImageUploadService({ db, inspectObject })(input),
    ).resolves.toEqual({ kind: "invalid_upload" });
    expect(transaction).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
  });

  it("rechecks authorization after inspecting R2", async () => {
    const { db, transaction, update } = createFakeDatabase({
      users: [true, false],
    });
    const inspectObject = vi.fn(async () => ({
      contentType: "image/webp",
      byteSize: 2_048,
    }));

    await expect(
      createConfirmRecipeImageUploadService({ db, inspectObject })(input),
    ).resolves.toEqual({ kind: "unauthorized" });
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(update).not.toHaveBeenCalled();
  });

  it("accepts a concurrent confirmation idempotently", async () => {
    const confirmedAt = new Date("2026-08-09T12:00:00.000Z");
    const { db, update } = createFakeDatabase({
      images: [pendingImage, { id: imageId, confirmedAt }],
    });
    const inspectObject = vi.fn(async () => ({
      contentType: "image/webp",
      byteSize: 2_048,
    }));

    await expect(
      createConfirmRecipeImageUploadService({ db, inspectObject })(input),
    ).resolves.toEqual({
      kind: "success",
      image: { id: imageId, confirmedAt },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("returns not found when the tenant-scoped image is absent", async () => {
    const { db, transaction, update } = createFakeDatabase({ images: [null] });
    const inspectObject = vi.fn(async () => null);

    await expect(
      createConfirmRecipeImageUploadService({ db, inspectObject })(input),
    ).resolves.toEqual({ kind: "not_found" });
    expect(transaction).toHaveBeenCalledOnce();
    expect(inspectObject).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("throws when the locked confirmation update returns no row", async () => {
    const { db } = createFakeDatabase({ updateReturnsRow: false });
    const inspectObject = vi.fn(async () => ({
      contentType: "image/webp",
      byteSize: 2_048,
    }));

    await expect(
      createConfirmRecipeImageUploadService({ db, inspectObject })(input),
    ).rejects.toThrow("Recipe image confirmation returned no row");
  });
});
