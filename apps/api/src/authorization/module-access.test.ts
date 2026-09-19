import type { DatabaseTransaction } from "@home-hub/database";
import {
  householdGuestAccessLinks,
  householdModuleSettings,
} from "@home-hub/database/schema";
import { describe, expect, it, vi } from "vitest";
import { authorizeHouseholdModule } from "./module-access";

const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const guestAccessLinkId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";

function createTransaction(access: "read" | "write" | undefined) {
  const locks: unknown[] = [];
  const select = vi.fn(() => {
    let table: unknown;
    const builder = {
      from(nextTable: unknown) {
        table = nextTable;
        return builder;
      },
      innerJoin() {
        return builder;
      },
      where() {
        return builder;
      },
      limit() {
        return builder;
      },
      async for(strength: unknown) {
        locks.push(strength);
        if (table === householdGuestAccessLinks && access) {
          return [{ guestAccessLinkId, householdId, access }];
        }
        if (table === householdModuleSettings) return [{ householdId }];
        return [];
      },
    };
    return builder;
  });
  return {
    locks,
    tx: { select } as unknown as DatabaseTransaction,
  };
}

describe("guest module authorization", () => {
  it("holds shared locks on current link and module state for the write", async () => {
    const { locks, tx } = createTransaction("write");
    await expect(
      authorizeHouseholdModule(tx, {
        requestAccess: {
          actor: { kind: "guest", guestAccessLinkId },
          householdScope: { householdId, permission: "write" },
        },
        householdId,
        moduleKey: "recipes",
        write: true,
      }),
    ).resolves.toBeUndefined();
    expect(locks).toEqual(["share", "share"]);
  });

  it("uses the current database access level instead of stale request state", async () => {
    const { tx } = createTransaction("read");
    await expect(
      authorizeHouseholdModule(tx, {
        requestAccess: {
          actor: { kind: "guest", guestAccessLinkId },
          householdScope: { householdId, permission: "write" },
        },
        householdId,
        moduleKey: "recipes",
        write: true,
      }),
    ).resolves.toBe("forbidden");
  });

  it("rejects an expired, disabled, or otherwise unavailable link", async () => {
    const { tx } = createTransaction(undefined);
    await expect(
      authorizeHouseholdModule(tx, {
        requestAccess: {
          actor: { kind: "guest", guestAccessLinkId },
          householdScope: { householdId, permission: "write" },
        },
        householdId,
        moduleKey: "recipes",
        write: false,
      }),
    ).resolves.toBe("forbidden");
  });
});
