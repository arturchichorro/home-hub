import type { Database } from "@home-hub/database";
import {
  householdMembers,
  householdModuleSettings,
  recipeImages,
} from "@home-hub/database/schema";
import { describe, expect, it, vi } from "vitest";
import { createRecipeImageReadUrlService } from "./create-read-url";
import { recipeImageReadUrlLifetimeSeconds } from "./sign-read";

const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const recipeId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const imageId = "671874b1-df9d-4a91-8f3c-8055473e8aa2";
const objectKey = `households/${householdId}/recipes/${recipeId}/${imageId}`;
const input = { userId, householdId, recipeId, imageId };

function createFakeDatabase({
  user = true,
  membership = true,
  moduleEnabled = true,
  image = true,
  events = [],
}: {
  user?: boolean;
  membership?: boolean;
  moduleEnabled?: boolean;
  image?: boolean;
  events?: string[];
} = {}) {
  const results = [
    membership ? { id: "membership-id" } : undefined,
    moduleEnabled ? { householdId } : undefined,
    image ? { objectKey } : undefined,
  ];
  const tables: unknown[] = [];
  const lockStrengths: unknown[] = [];

  const select = vi.fn((_selection: unknown) => {
    const result = results.shift();
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

  const tx = {
    query: {
      users: {
        findFirst: vi.fn(async () => (user ? { id: userId } : undefined)),
      },
    },
    select,
  };
  const transaction = vi.fn(
    async <T>(operation: (transaction: typeof tx) => Promise<T>) => {
      events.push("transaction:start");
      const result = await operation(tx);
      events.push("transaction:end");
      return result;
    },
  );

  return {
    db: { transaction } as unknown as Database,
    lockStrengths,
    tables,
    transaction,
  };
}

describe("create recipe image read URL service", () => {
  it("authorizes a confirmed image before signing outside the transaction", async () => {
    const events: string[] = [];
    const { db, lockStrengths, tables, transaction } = createFakeDatabase({
      events,
    });
    const signRead = vi.fn(async () => {
      events.push("sign");
      return "https://signed-read.example";
    });

    await expect(
      createRecipeImageReadUrlService({ db, signRead })(input),
    ).resolves.toEqual({
      kind: "success",
      url: "https://signed-read.example",
      expiresInSeconds: recipeImageReadUrlLifetimeSeconds,
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(signRead).toHaveBeenCalledWith({ objectKey });
    expect(events).toEqual(["transaction:start", "transaction:end", "sign"]);
    expect(lockStrengths).toEqual(["share", "share", "share"]);
    expect(tables).toEqual([
      householdMembers,
      householdModuleSettings,
      recipeImages,
    ]);
  });

  it.each([
    [{ user: false }, "unauthorized"],
    [{ membership: false }, "forbidden"],
    [{ moduleEnabled: false }, "forbidden"],
    [{ image: false }, "not_found"],
  ] as const)("does not sign rejected access: %s", async (options, kind) => {
    const { db } = createFakeDatabase(options);
    const signRead = vi.fn(async () => "https://signed-read.example");

    await expect(
      createRecipeImageReadUrlService({ db, signRead })(input),
    ).resolves.toEqual({ kind });
    expect(signRead).not.toHaveBeenCalled();
  });
});
