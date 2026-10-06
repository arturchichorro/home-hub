import type { Database } from "@home-hub/database";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashGuestCredential } from "./credential";
import { createGuestLinkService } from "./service";

const input = {
  userId: "owner",
  householdId: "household",
  name: "Kitchen",
  access: "write" as const,
};
function database({
  user = true,
  household = true,
  owner = true,
  disabledAt = null as Date | null,
  link = true,
} = {}) {
  const rows = [
    household ? [{ id: "household" }] : [],
    owner ? [{ id: "membership" }] : [],
    link ? [{ id: "link", disabledAt }] : [],
  ];
  const values = vi.fn((value) => ({
    returning: async () => {
      const { tokenHash: _, createdByUserId: __, ...publicLink } = value;
      return [{ ...publicLink, disabledAt: null }];
    },
  }));
  const set = vi.fn(() => ({ where: async () => undefined }));
  const selections: unknown[] = [];
  const builder = {
    from: () => builder,
    where: () => builder,
    limit: () => builder,
    for: async () => rows.shift(),
    orderBy: async () => [],
  };
  const tx = {
    query: {
      users: { findFirst: async () => (user ? { id: "owner" } : undefined) },
    },
    select: (columns: unknown) => {
      selections.push(columns);
      return builder;
    },
    insert: () => ({ values }),
    update: () => ({ set }),
  };
  return {
    db: {
      transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    } as unknown as Database,
    values,
    set,
    selections,
  };
}
afterEach(() => vi.useRealTimers());
describe("Guest link management", () => {
  it("returns the secret once, persists only its hash, and defaults to exactly 90 days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
    const fake = database();
    const result = await createGuestLinkService(fake).create(input);
    expect(result.kind).toBe("success");
    if (result.kind !== "success") throw new Error("Expected success");
    expect(result.link?.expiresAt).toEqual(new Date("2026-12-19T12:00:00Z"));
    expect(fake.values.mock.calls[0]?.[0]).toMatchObject({
      tokenHash: hashGuestCredential(result.credential),
    });
    expect(JSON.stringify(fake.values.mock.calls)).not.toContain(
      result.credential,
    );
    expect(result.link).not.toHaveProperty("tokenHash");
  });
  it.each(["create", "list", "disable"] as const)(
    "requires the current owner for %s",
    async (operation) => {
      for (const state of [
        { user: false },
        { household: false },
        { owner: false },
      ]) {
        const fake = database(state);
        const result = await createGuestLinkService(fake)[operation]({
          ...input,
          linkId: "link",
        });
        expect(result.kind).toBe(
          state.user === false ? "unauthorized" : "forbidden",
        );
        expect(fake.values).not.toHaveBeenCalled();
        expect(fake.set).not.toHaveBeenCalled();
      }
    },
  );
  it("honors the initial expiration", async () => {
    const expiresAt = new Date(Date.now() + 123456);
    const result = await createGuestLinkService(database()).create({
      ...input,
      expiresAt,
    });
    expect(result).toMatchObject({ kind: "success", link: { expiresAt } });
  });
  it.each([new Date(0), new Date("invalid")])(
    "rejects invalid expiration",
    async (expiresAt) => {
      const fake = database();
      expect(
        await createGuestLinkService(fake).create({ ...input, expiresAt }),
      ).toEqual({ kind: "invalid" });
      expect(fake.values).not.toHaveBeenCalled();
    },
  );
  it("permanently disables without changing configuration", async () => {
    const fake = database();
    expect(
      await createGuestLinkService(fake).disable({ ...input, linkId: "link" }),
    ).toEqual({ kind: "success" });
    expect(fake.set).toHaveBeenCalledWith({ disabledAt: expect.any(Date) });
  });
  it("does not rewrite a previous disable time", async () => {
    const fake = database({ disabledAt: new Date(0) });
    expect(
      await createGuestLinkService(fake).disable({ ...input, linkId: "link" }),
    ).toEqual({ kind: "success" });
    expect(fake.set).not.toHaveBeenCalled();
  });
  it("does not disable a link outside the scoped household", async () => {
    const fake = database({ link: false });
    expect(
      await createGuestLinkService(fake).disable({ ...input, linkId: "link" }),
    ).toEqual({ kind: "not_found" });
    expect(fake.set).not.toHaveBeenCalled();
  });
  it("never selects a credential hash for owner listing", async () => {
    const fake = database();
    await createGuestLinkService(fake).list(input);
    expect(fake.selections.at(-1)).not.toHaveProperty("tokenHash");
  });
});
