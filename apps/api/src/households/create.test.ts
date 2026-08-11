import type { Database } from "@home-hub/database";
import {
  householdMembers,
  householdModuleSettings,
  households,
} from "@home-hub/database/schema";
import { describe, expect, it, vi } from "vitest";

import { createHouseholdService } from "./create";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";

function createFakeDatabase({
  userExists = true,
  failMembershipInsert = false,
  failModuleSettingsInsert = false,
}: {
  userExists?: boolean;
  failMembershipInsert?: boolean;
  failModuleSettingsInsert?: boolean;
} = {}) {
  const inserted: Array<{ table: unknown; values: unknown }> = [];
  const findUser = vi.fn(async () => (userExists ? { id: userId } : undefined));

  const tx = {
    query: {
      users: {
        findFirst: findUser,
      },
    },
    insert: (table: unknown) => ({
      values: async (values: unknown) => {
        inserted.push({ table, values });

        if (table === householdMembers && failMembershipInsert) {
          throw new Error("membership insert failed");
        }

        if (table === householdModuleSettings && failModuleSettingsInsert) {
          throw new Error("module settings insert failed");
        }
      },
    }),
  };

  const transaction = vi.fn(
    async <T>(operation: (transaction: typeof tx) => Promise<T>) =>
      operation(tx),
  );

  return {
    db: { transaction } as unknown as Database,
    findUser,
    inserted,
    transaction,
  };
}

describe("create household service", () => {
  it("creates a household and its owner membership in one transaction", async () => {
    const { db, findUser, inserted, transaction } = createFakeDatabase();
    const createHousehold = createHouseholdService({ db });

    const result = await createHousehold({
      userId,
      name: "Home",
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") {
      throw new Error("Expected household creation to succeed");
    }

    expect(transaction).toHaveBeenCalledOnce();
    expect(findUser).toHaveBeenCalledWith({
      columns: { id: true },
      where: expect.any(Function),
    });
    expect(inserted).toHaveLength(3);
    expect(inserted[0]).toEqual({
      table: households,
      values: {
        id: result.household.id,
        name: "Home",
      },
    });
    expect(inserted[1]).toEqual({
      table: householdMembers,
      values: {
        id: expect.any(String),
        householdId: result.household.id,
        userId,
        role: "owner",
      },
    });
    expect(inserted[2]).toEqual({
      table: householdModuleSettings,
      values: [
        {
          householdId: result.household.id,
          moduleKey: "shopping",
          enabled: true,
        },
        {
          householdId: result.household.id,
          moduleKey: "recipes",
          enabled: true,
        },
      ],
    });
    expect(result.household).toEqual({
      id: expect.any(String),
      name: "Home",
    });
  });

  it("returns unauthorized without inserting when the user no longer exists", async () => {
    const { db, inserted, transaction } = createFakeDatabase({
      userExists: false,
    });
    const createHousehold = createHouseholdService({ db });

    await expect(
      createHousehold({
        userId,
        name: "Home",
      }),
    ).resolves.toEqual({ kind: "unauthorized" });

    expect(transaction).toHaveBeenCalledOnce();
    expect(inserted).toHaveLength(0);
  });

  it("propagates a membership insert failure from the transaction", async () => {
    const { db, inserted, transaction } = createFakeDatabase({
      failMembershipInsert: true,
    });
    const createHousehold = createHouseholdService({ db });

    await expect(
      createHousehold({
        userId,
        name: "Home",
      }),
    ).rejects.toThrow("membership insert failed");

    expect(transaction).toHaveBeenCalledOnce();
    expect(inserted.map(({ table }) => table)).toEqual([
      households,
      householdMembers,
    ]);
  });

  it("propagates a module-settings insert failure from the transaction", async () => {
    const { db, inserted, transaction } = createFakeDatabase({
      failModuleSettingsInsert: true,
    });
    const createHousehold = createHouseholdService({ db });

    await expect(
      createHousehold({
        userId,
        name: "Home",
      }),
    ).rejects.toThrow("module settings insert failed");

    expect(transaction).toHaveBeenCalledOnce();
    expect(inserted.map(({ table }) => table)).toEqual([
      households,
      householdMembers,
      householdModuleSettings,
    ]);
  });
});
