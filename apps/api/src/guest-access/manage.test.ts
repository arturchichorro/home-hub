import type { Database } from "@home-hub/database";
import {
  householdGuestAccessLinks,
  householdMembers,
} from "@home-hub/database/schema";
import { describe, expect, it, vi } from "vitest";
import {
  createGuestAccessLinkService,
  createRegenerateGuestAccessLinkService,
  createUpdateGuestAccessLinkService,
} from "./manage";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const linkId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const now = new Date("2026-09-19T12:00:00.000Z");
const expiresAt = new Date("2026-12-18T12:00:00.000Z");

function createDatabase(
  input: { user?: boolean; owner?: boolean; link?: boolean } = {},
) {
  const insertedValues: Record<string, unknown>[] = [];
  const updatedValues: Record<string, unknown>[] = [];
  let selectedTable: unknown;
  const existingLink = {
    id: linkId,
    householdId,
    name: "Kitchen QR",
    access: "write" as const,
    expiresAt,
    disabledAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const selectBuilder = {
    from(table: unknown) {
      selectedTable = table;
      return selectBuilder;
    },
    where() {
      return selectBuilder;
    },
    limit() {
      return selectBuilder;
    },
    async for() {
      if (selectedTable === householdMembers) {
        return input.owner === false ? [] : [{ id: "owner-membership" }];
      }
      return input.link === false ? [] : [existingLink];
    },
  };
  const returning = async () => {
    const values = updatedValues.at(-1) ?? insertedValues.at(-1) ?? {};
    return [{ ...existingLink, ...values }];
  };
  const tx = {
    query: {
      users: {
        findFirst: async () =>
          input.user === false ? undefined : { id: userId },
      },
    },
    select: () => selectBuilder,
    insert: (table: unknown) => {
      expect(table).toBe(householdGuestAccessLinks);
      return {
        values(values: Record<string, unknown>) {
          insertedValues.push(values);
          return { returning };
        },
      };
    },
    update: (table: unknown) => {
      expect(table).toBe(householdGuestAccessLinks);
      return {
        set(values: Record<string, unknown>) {
          updatedValues.push(values);
          return { where: () => ({ returning }) };
        },
      };
    },
  };
  return {
    db: {
      transaction: vi.fn(async (operation) => operation(tx)),
    } as unknown as Database,
    insertedValues,
    updatedValues,
  };
}

describe("Guest access link management", () => {
  it("creates links with the server default or a future custom expiration", async () => {
    const defaultFixture = createDatabase();
    const createDefault = createGuestAccessLinkService({
      db: defaultFixture.db,
      now: () => now,
    });
    await expect(
      createDefault({
        userId,
        householdId,
        name: "Kitchen QR",
        access: "write",
      }),
    ).resolves.toMatchObject({ kind: "success", link: { expiresAt } });
    expect(defaultFixture.insertedValues[0]).toMatchObject({ expiresAt });

    const customFixture = createDatabase();
    const customExpiration = "2027-01-01T00:00:00.000Z";
    await createGuestAccessLinkService({
      db: customFixture.db,
      now: () => now,
    })({
      userId,
      householdId,
      name: "Family QR",
      access: "read",
      expiresAt: customExpiration,
    });
    expect(customFixture.insertedValues[0]?.expiresAt).toEqual(
      new Date(customExpiration),
    );
  });

  it("rejects non-future expiration without writing", async () => {
    const fixture = createDatabase();
    const result = await createGuestAccessLinkService({
      db: fixture.db,
      now: () => now,
    })({
      userId,
      householdId,
      name: "Kitchen QR",
      access: "write",
      expiresAt: now.toISOString(),
    });
    expect(result).toEqual({ kind: "invalid_expiration" });
    expect(fixture.insertedValues).toEqual([]);
  });

  it("changes disablement without changing expiration", async () => {
    const fixture = createDatabase();
    const result = await createUpdateGuestAccessLinkService({
      db: fixture.db,
      now: () => now,
    })({ userId, householdId, guestAccessLinkId: linkId, enabled: false });

    expect(result).toMatchObject({
      kind: "success",
      link: { expiresAt, disabledAt: now },
    });
    expect(fixture.updatedValues[0]).not.toHaveProperty("expiresAt");
  });

  it("updates expiration independently", async () => {
    const fixture = createDatabase();
    const extended = "2027-03-01T00:00:00.000Z";
    await createUpdateGuestAccessLinkService({
      db: fixture.db,
      now: () => now,
    })({
      userId,
      householdId,
      guestAccessLinkId: linkId,
      expiresAt: extended,
    });
    expect(fixture.updatedValues[0]).toMatchObject({
      expiresAt: new Date(extended),
    });
    expect(fixture.updatedValues[0]).not.toHaveProperty("disabledAt");
  });

  it("regenerates only the secret and update timestamp", async () => {
    const fixture = createDatabase();
    const result = await createRegenerateGuestAccessLinkService({
      db: fixture.db,
    })({ userId, householdId, guestAccessLinkId: linkId });

    expect(result).toMatchObject({ kind: "success", link: { expiresAt } });
    expect(fixture.updatedValues[0]).toEqual({
      tokenHash: expect.any(String),
      updatedAt: expect.any(Date),
    });
  });

  it("requires an active owner before writing", async () => {
    for (const fixture of [
      createDatabase({ user: false }),
      createDatabase({ owner: false }),
    ]) {
      const result = await createGuestAccessLinkService({ db: fixture.db })({
        userId,
        householdId,
        name: "Kitchen QR",
        access: "write",
      });
      expect(["unauthorized", "forbidden"]).toContain(result.kind);
      expect(fixture.insertedValues).toEqual([]);
    }
  });
});
