import type { createDbClient } from "@home-hub/database/client";
import {
  householdMembers,
  householdModuleSettings,
  recipeCookLogs,
  recipeImages,
  recipes,
} from "@home-hub/database/schema";
import { describe, expect, it, vi } from "vitest";
import {
  createRecipeImageObjectKey,
  createRecipeImageUploadService,
} from "./create-upload";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const recipeId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const cookLogId = "5944cb0d-931a-4723-b981-77eacb122314";

const input = {
  userId,
  householdId,
  recipeId,
  cookLogId: null,
  contentType: "image/webp" as const,
  byteSize: 2_048,
  width: 800,
  height: 600,
  position: 0,
};

type Database = ReturnType<typeof createDbClient>["db"];

function createFakeDatabase({
  userExists = true,
  membershipExists = true,
  moduleEnabled = true,
  recipeExists = true,
  cookLogExists = true,
  insertReturnsRow = true,
}: {
  userExists?: boolean;
  membershipExists?: boolean;
  moduleEnabled?: boolean;
  recipeExists?: boolean;
  cookLogExists?: boolean;
  insertReturnsRow?: boolean;
} = {}) {
  const findUser = vi.fn(async () => (userExists ? { id: userId } : undefined));
  const tables: unknown[] = [];
  const lockStrengths: unknown[] = [];
  const insertedValues: Array<Record<string, unknown>> = [];
  const selectResults = [
    membershipExists ? { id: "membership-id" } : undefined,
    moduleEnabled ? { householdId } : undefined,
    recipeExists ? { id: recipeId } : undefined,
    cookLogExists ? { id: cookLogId } : undefined,
  ];

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

  const insert = vi.fn((table: unknown) => {
    tables.push(table);
    return {
      values: (values: Record<string, unknown>) => {
        insertedValues.push(values);
        return {
          returning: async () =>
            insertReturnsRow ? [{ id: values.id as string }] : [],
        };
      },
    };
  });

  const tx = { query: { users: { findFirst: findUser } }, select, insert };
  const transaction = vi.fn(
    async <T>(operation: (transaction: typeof tx) => Promise<T>) =>
      operation(tx),
  );

  return {
    db: { transaction } as unknown as Database,
    findUser,
    insertedValues,
    lockStrengths,
    tables,
  };
}

describe("createRecipeImageObjectKey", () => {
  it("builds a server-controlled tenant and recipe scoped key", () => {
    expect(
      createRecipeImageObjectKey({
        householdId,
        recipeId,
        imageId: "671874b1-df9d-4a91-8f3c-8055473e8aa2",
      }),
    ).toBe(
      `households/${householdId}/recipes/${recipeId}/671874b1-df9d-4a91-8f3c-8055473e8aa2`,
    );
  });
});

describe("create recipe image upload service", () => {
  it("creates pending metadata and signs its server-controlled key", async () => {
    const { db, insertedValues, lockStrengths, tables } = createFakeDatabase();
    const signUpload = vi.fn(async () => "https://signed-upload.example");
    const createUpload = createRecipeImageUploadService({ db, signUpload });

    const result = await createUpload(input);

    expect(result).toMatchObject({
      kind: "success",
      uploadUrl: "https://signed-upload.example",
      uploadUrlExpiresInSeconds: 300,
    });
    if (result.kind !== "success") throw new Error("Expected success");

    expect(tables).toEqual([
      householdMembers,
      householdModuleSettings,
      recipes,
      recipeImages,
    ]);
    expect(lockStrengths).toEqual(["share", "share", "share"]);
    expect(insertedValues).toEqual([
      {
        id: result.imageId,
        householdId,
        recipeId,
        cookLogId: null,
        objectKey: `households/${householdId}/recipes/${recipeId}/${result.imageId}`,
        contentType: "image/webp",
        byteSize: 2_048,
        width: 800,
        height: 600,
        position: 0,
        confirmedAt: null,
      },
    ]);
    expect(signUpload).toHaveBeenCalledWith({
      objectKey: `households/${householdId}/recipes/${recipeId}/${result.imageId}`,
      contentType: "image/webp",
    });
  });

  it("validates an optional cooking log within the same recipe", async () => {
    const { db, lockStrengths, tables } = createFakeDatabase();
    const signUpload = vi.fn(async () => "https://signed-upload.example");
    const createUpload = createRecipeImageUploadService({ db, signUpload });

    await expect(createUpload({ ...input, cookLogId })).resolves.toMatchObject({
      kind: "success",
    });

    expect(tables).toEqual([
      householdMembers,
      householdModuleSettings,
      recipes,
      recipeCookLogs,
      recipeImages,
    ]);
    expect(lockStrengths).toEqual(["share", "share", "share", "share"]);
  });

  it("returns unauthorized before authorization or writes for a missing user", async () => {
    const { db, tables } = createFakeDatabase({ userExists: false });
    const signUpload = vi.fn(async () => "https://signed-upload.example");

    await expect(
      createRecipeImageUploadService({ db, signUpload })(input),
    ).resolves.toEqual({ kind: "unauthorized" });
    expect(tables).toHaveLength(0);
    expect(signUpload).not.toHaveBeenCalled();
  });

  it.each([
    ["membership", { membershipExists: false }],
    ["Recipes module", { moduleEnabled: false }],
  ] as const)(
    "returns forbidden when %s access is missing",
    async (_label, options) => {
      const { db, insertedValues } = createFakeDatabase(options);
      const signUpload = vi.fn(async () => "https://signed-upload.example");

      await expect(
        createRecipeImageUploadService({ db, signUpload })(input),
      ).resolves.toEqual({ kind: "forbidden" });
      expect(insertedValues).toHaveLength(0);
      expect(signUpload).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["recipe", { recipeExists: false }, input],
    ["cooking log", { cookLogExists: false }, { ...input, cookLogId }],
  ] as const)(
    "returns not found for a foreign or missing %s",
    async (_label, options, serviceInput) => {
      const { db, insertedValues } = createFakeDatabase(options);
      const signUpload = vi.fn(async () => "https://signed-upload.example");

      await expect(
        createRecipeImageUploadService({ db, signUpload })(serviceInput),
      ).resolves.toEqual({ kind: "not_found" });
      expect(insertedValues).toHaveLength(0);
      expect(signUpload).not.toHaveBeenCalled();
    },
  );

  it("fails the transaction when pending metadata cannot be returned", async () => {
    const { db } = createFakeDatabase({ insertReturnsRow: false });
    const signUpload = vi.fn(async () => "https://signed-upload.example");

    await expect(
      createRecipeImageUploadService({ db, signUpload })(input),
    ).rejects.toThrow("Pending recipe image insert returned no row");
    expect(signUpload).not.toHaveBeenCalled();
  });

  it("propagates signing failure so the database transaction rolls back", async () => {
    const { db, insertedValues } = createFakeDatabase();
    const signUpload = vi.fn(async () => {
      throw new Error("signing failed");
    });

    await expect(
      createRecipeImageUploadService({ db, signUpload })(input),
    ).rejects.toThrow("signing failed");
    expect(insertedValues).toHaveLength(1);
  });
});
