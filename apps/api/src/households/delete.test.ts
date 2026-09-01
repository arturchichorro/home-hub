import type { Database } from "@home-hub/database";
import { households } from "@home-hub/database/schema";
import { describe, expect, it, vi } from "vitest";

import { createDeleteHouseholdService } from "./delete";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";

function createFakeDatabase({
  userExists = true,
  isOwner = true,
  householdExists = true,
}: {
  userExists?: boolean;
  isOwner?: boolean;
  householdExists?: boolean;
} = {}) {
  const findUser = vi.fn(async () => (userExists ? { id: userId } : undefined));
  const updatedTables: unknown[] = [];
  const patches: unknown[] = [];

  const selectBuilder = {
    from: () => selectBuilder,
    where: () => selectBuilder,
    limit: () => selectBuilder,
    for: async () => (isOwner ? [{ id: "membership-id", role: "owner" }] : []),
  };
  const updateBuilder = {
    set(patch: unknown) {
      patches.push(patch);
      return updateBuilder;
    },
    where() {
      return updateBuilder;
    },
    async returning() {
      return householdExists ? [{ id: householdId }] : [];
    },
  };
  const tx = {
    query: { users: { findFirst: findUser } },
    select: () => selectBuilder,
    update(table: unknown) {
      updatedTables.push(table);
      return updateBuilder;
    },
  };
  const transaction = vi.fn(
    async <T>(operation: (transaction: typeof tx) => Promise<T>) =>
      operation(tx),
  );

  return {
    db: { transaction } as unknown as Database,
    patches,
    transaction,
    updatedTables,
  };
}

function remove(db: Database) {
  return createDeleteHouseholdService({ db })({ householdId, userId });
}

describe("delete household service", () => {
  it("requires an active user", async () => {
    const { db, updatedTables } = createFakeDatabase({ userExists: false });

    await expect(remove(db)).resolves.toEqual({ kind: "unauthorized" });
    expect(updatedTables).toHaveLength(0);
  });

  it("allows only the owner", async () => {
    const { db, updatedTables } = createFakeDatabase({ isOwner: false });

    await expect(remove(db)).resolves.toEqual({ kind: "forbidden" });
    expect(updatedTables).toHaveLength(0);
  });

  it("soft-deletes the household without deleting its data", async () => {
    const { db, patches, updatedTables } = createFakeDatabase();

    await expect(remove(db)).resolves.toEqual({ kind: "success" });
    expect(updatedTables).toEqual([households]);
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({
      deletedAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
  });

  it("does not delete an already deleted household again", async () => {
    const { db } = createFakeDatabase({ householdExists: false });

    await expect(remove(db)).resolves.toEqual({ kind: "forbidden" });
  });
});
