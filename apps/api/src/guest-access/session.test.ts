import type { Database, DatabaseTransaction } from "@home-hub/database";
import {
  householdGuestAccessLinks,
  householdGuestSessions,
  householdModuleSettings,
} from "@home-hub/database/schema";
import { describe, expect, it, vi } from "vitest";
import {
  createRedeemGuestAccessService,
  createRefreshGuestAccessService,
} from "./session";
import { hashGuestSessionToken } from "./token";

const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const linkId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";
const sessionId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const jwtSecret = "test-jwt-secret";

function createDatabase(input: {
  enabled?: boolean;
  link?: boolean;
  session?: boolean;
}) {
  let selectedTable: unknown;
  let insertedSession: Record<string, unknown> | undefined;
  const builder = {
    from(table: unknown) {
      selectedTable = table;
      return builder;
    },
    innerJoin() {
      return builder;
    },
    where() {
      if (selectedTable === householdModuleSettings) {
        return Promise.resolve(input.enabled ? [{ moduleKey: "recipes" }] : []);
      }
      return builder;
    },
    limit() {
      return builder;
    },
    async for() {
      if (selectedTable === householdGuestAccessLinks && input.link) {
        return [
          {
            id: linkId,
            householdId,
            householdName: "Coliving",
            access: "write" as const,
          },
        ];
      }
      if (selectedTable === householdGuestSessions && input.session) {
        return [
          {
            sessionId,
            householdId,
            householdName: "Coliving",
            access: "read" as const,
          },
        ];
      }
      return [];
    },
  };
  const updateWhere = vi.fn(async () => undefined);
  const tx = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => ({
      values: vi.fn(async (value: Record<string, unknown>) => {
        insertedSession = value;
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: updateWhere })),
    })),
  } as unknown as DatabaseTransaction;
  const db = {
    transaction: vi.fn(
      async (callback: (transaction: DatabaseTransaction) => unknown) =>
        callback(tx),
    ),
  } as unknown as Database;
  return {
    db,
    insertedSession: () => insertedSession,
    updateWhere,
  };
}

describe("Guest access sessions", () => {
  it("redeems a link into a separately hashed device session", async () => {
    const fixture = createDatabase({ link: true, enabled: true });
    const redeem = createRedeemGuestAccessService({
      db: fixture.db,
      jwtSecret,
    });

    const result = await redeem("q".repeat(43));

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.session.enabledModules).toEqual(["recipes"]);
    expect(result.session.cacheIdentity).toMatch(/^guest-session:/);
    expect(fixture.insertedSession()).toMatchObject({
      guestAccessLinkId: linkId,
      tokenHash: hashGuestSessionToken(result.session.sessionToken),
    });
  });

  it("refreshes current permission and enabled modules from the database", async () => {
    const fixture = createDatabase({ session: true, enabled: false });
    const refresh = createRefreshGuestAccessService({
      db: fixture.db,
      jwtSecret,
    });

    const result = await refresh("s".repeat(43));

    expect(result).toMatchObject({
      kind: "success",
      session: {
        access: "read",
        cacheIdentity: `guest-session:${sessionId}`,
        enabledModules: [],
      },
    });
    expect(fixture.updateWhere).toHaveBeenCalledOnce();
  });
});
