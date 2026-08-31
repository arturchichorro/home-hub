import type { Database } from "@home-hub/database";
import {
  householdMembers,
  householdModuleSettings,
} from "@home-hub/database/schema";
import { describe, expect, it, vi } from "vitest";

import { createSetHouseholdModuleEnabledService } from "./set-module-enabled";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";

function fakeDb({ user = true, owner = true, setting = true } = {}) {
  const tables: unknown[] = [];
  const locks: unknown[] = [];
  const updates: unknown[] = [];
  const selectBuilder = {
    from(table: unknown) {
      tables.push(table);
      return selectBuilder;
    },
    where() {
      return selectBuilder;
    },
    limit() {
      return selectBuilder;
    },
    async for(lock: unknown) {
      locks.push(lock);
      return tables.at(-1) === householdMembers
        ? owner
          ? [{ id: "owner" }]
          : []
        : setting
          ? [{ moduleKey: "lists" }]
          : [];
    },
  };
  const updateBuilder = {
    set(value: unknown) {
      updates.push(value);
      return updateBuilder;
    },
    where() {
      return updateBuilder;
    },
    async returning() {
      return [{ moduleKey: "lists", enabled: false }];
    },
  };
  const tx = {
    query: {
      users: { findFirst: async () => (user ? { id: userId } : undefined) },
    },
    select: () => selectBuilder,
    update: () => updateBuilder,
  };
  return {
    db: { transaction: vi.fn(async (fn) => fn(tx)) } as unknown as Database,
    locks,
    tables,
    updates,
  };
}

const input = {
  userId,
  householdId,
  moduleKey: "lists" as const,
  enabled: false,
};

describe("set household module enabled service", () => {
  it("returns unauthorized for a missing user", async () => {
    const { db, tables } = fakeDb({ user: false });
    await expect(
      createSetHouseholdModuleEnabledService({ db })(input),
    ).resolves.toEqual({ kind: "unauthorized" });
    expect(tables).toHaveLength(0);
  });

  it("requires the current owner", async () => {
    const { db, locks, tables } = fakeDb({ owner: false });
    await expect(
      createSetHouseholdModuleEnabledService({ db })(input),
    ).resolves.toEqual({ kind: "forbidden" });
    expect(tables).toEqual([householdMembers]);
    expect(locks).toEqual(["share"]);
  });

  it("fails closed when the known module setting is missing", async () => {
    const { db, locks, tables, updates } = fakeDb({ setting: false });
    await expect(
      createSetHouseholdModuleEnabledService({ db })(input),
    ).resolves.toEqual({ kind: "module_not_configured" });
    expect(tables).toEqual([householdMembers, householdModuleSettings]);
    expect(locks).toEqual(["share", "update"]);
    expect(updates).toHaveLength(0);
  });

  it("updates the locked setting", async () => {
    const { db, locks, updates } = fakeDb();
    await expect(
      createSetHouseholdModuleEnabledService({ db })(input),
    ).resolves.toEqual({
      kind: "success",
      setting: { moduleKey: "lists", enabled: false },
    });
    expect(locks).toEqual(["share", "update"]);
    expect(updates[0]).toMatchObject({ enabled: false });
  });
});
