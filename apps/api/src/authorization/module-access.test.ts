import type { DatabaseTransaction } from "@home-hub/database";
import { describe, expect, it, vi } from "vitest";
import { authorizeModule } from "./module-access";

const principal = {
  guest: {
    id: "link",
    householdId: "home",
    access: "write" as const,
    expiresAt: Date.now() + 10000,
  },
};
function transaction(rows: unknown[][]) {
  const locks = vi.fn(async () => rows.shift() ?? []);
  const builder = {
    from: () => builder,
    where: () => builder,
    limit: () => builder,
    for: locks,
  };
  return {
    tx: { select: () => builder } as unknown as DatabaseTransaction,
    locks,
  };
}
describe("shared module authorization", () => {
  it.each(["lists", "recipes"] as const)(
    "allows read access to enabled %s without relying on the context access level",
    async (moduleKey) => {
      const { tx, locks } = transaction([
        [{ access: "read" }],
        [{ id: "home" }],
        [{ householdId: "home" }],
      ]);
      expect(
        await authorizeModule(tx, {
          principal,
          householdId: "home",
          moduleKey,
          write: false,
        }),
      ).toBeUndefined();
      expect(locks.mock.calls).toEqual([["share"], ["share"], ["share"]]);
    },
  );
  it("rejects writes from a read grant using current PostgreSQL permissions", async () => {
    const { tx, locks } = transaction([[{ access: "read" }]]);
    expect(
      await authorizeModule(tx, {
        principal,
        householdId: "home",
        moduleKey: "recipes",
        write: true,
      }),
    ).toBe("forbidden");
    expect(locks).toHaveBeenCalledOnce();
  });
  it.each([
    [[]],
    [[{ access: "write" }], []],
    [[{ access: "write" }], [{ id: "home" }], []],
  ])(
    "denies missing/disabled/expired grants, deleted households, and disabled modules",
    async (...rows) => {
      const { tx } = transaction(rows);
      expect(
        await authorizeModule(tx, {
          principal,
          householdId: "home",
          moduleKey: "lists",
          write: true,
        }),
      ).toMatch(/unauthorized|forbidden/);
    },
  );
});
