import type { Transaction } from "@rocicorp/zero";
import { describe, expect, it, vi } from "vitest";
import type { ZeroAuthContext } from "./context";
import { zeroCacheIdentity } from "./context";
import { requireServerHouseholdModuleAccess } from "./mutation-authorization";
import { queries } from "./queries";
import type { Schema } from "./schema.gen";

const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const ctx: ZeroAuthContext = {
  guest: {
    id: "671874b1-df9d-4a91-8f3c-8055473e8aa2",
    householdId,
    access: "write",
    expiresAt: Date.now() + 10000,
  },
};
describe("Guest Zero authorization", () => {
  it.each(["lists", "recipes"] as const)(
    "locks current database permissions before a %s mutation",
    async (moduleKey) => {
      const query = vi.fn(async (_sql: string, _params: unknown[]) => [
        { id: ctx.guest?.id },
      ]);
      const tx = {
        location: "server",
        dbTransaction: { query },
      } as unknown as Transaction<Schema>;
      await requireServerHouseholdModuleAccess({
        tx,
        ctx,
        householdId,
        moduleKey,
      });
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("FOR SHARE OF l, h, m"),
        [ctx.guest?.id, householdId, moduleKey],
      );
      const sql = query.mock.calls[0]?.[0];
      expect(sql).toContain("l.access = 'write'");
      expect(sql).toContain("l.disabled_at IS NULL");
      expect(sql).toContain("l.expires_at > clock_timestamp()");
      expect(sql).toContain("h.deleted_at IS NULL");
      expect(sql).toContain("m.enabled");
    },
  );
  it("rejects a removed grant even if the boundary context previously allowed writing", async () => {
    const tx = {
      location: "server",
      dbTransaction: { query: async () => [] },
    } as unknown as Transaction<Schema>;
    await expect(
      requireServerHouseholdModuleAccess({
        tx,
        ctx,
        householdId,
        moduleKey: "lists",
      }),
    ).rejects.toThrow("not allowed");
  });
  it("scopes both module queries to the server-derived household and current enabled state", () => {
    for (const query of [
      queries.lists.byHousehold,
      queries.recipes.byHousehold,
    ]) {
      const result = query.fn({
        args: { householdId: "9f8a6942-f721-499d-957d-7bb3ed1158db" },
        ctx,
      });
      const ast = JSON.stringify((result as unknown as { ast: unknown }).ast);
      expect(ast).toContain(householdId);
      expect(ast).toContain("enabled");
      expect(ast).toContain("deletedAt");
    }
  });
  it("uses the non-secret link ID for the cache identity", () => {
    expect(zeroCacheIdentity(ctx)).toBe(`guest-link:${ctx.guest?.id}`);
  });
});
