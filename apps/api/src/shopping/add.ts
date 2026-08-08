import { randomUUID } from "node:crypto";
import type { createDbClient } from "@home-hub/database/client";
import {
  householdMembers,
  householdModuleSettings,
  shoppingItems,
} from "@home-hub/database/schema";
import {
  cleanShoppingItemName,
  normalizeShoppingItemName,
} from "@home-hub/shared/normalization";
import { and, eq } from "drizzle-orm";

type Database = ReturnType<typeof createDbClient>["db"];
type ShoppingItemRow = typeof shoppingItems.$inferSelect;

export type AddShoppingItemInput = {
  userId: string;
  householdId: string;
  name: string;
};

export type AddShoppingItemResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | {
      kind: "success";
      item: {
        id: string;
        householdId: string;
        name: string;
        status: ShoppingItemRow["status"];
      };
    };

export function createAddShoppingItemService({ db }: { db: Database }) {
  return async function addShoppingItem({
    userId,
    householdId,
    name,
  }: AddShoppingItemInput): Promise<AddShoppingItemResult> {
    return db.transaction(async (tx) => {
      const user = await tx.query.users.findFirst({
        columns: { id: true },
        where: (users, { eq }) => eq(users.id, userId),
      });

      if (!user) {
        return { kind: "unauthorized" };
      }

      const [membership] = await tx
        .select({ id: householdMembers.id })
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, householdId),
            eq(householdMembers.userId, userId),
          ),
        )
        .limit(1)
        .for("share");

      if (!membership) {
        return { kind: "forbidden" };
      }

      const [moduleSetting] = await tx
        .select({ householdId: householdModuleSettings.householdId })
        .from(householdModuleSettings)
        .where(
          and(
            eq(householdModuleSettings.householdId, householdId),
            eq(householdModuleSettings.moduleKey, "shopping"),
            eq(householdModuleSettings.enabled, true),
          ),
        )
        .limit(1)
        .for("share");

      if (!moduleSetting) {
        return { kind: "forbidden" };
      }

      const shoppingItemId = randomUUID();
      const cleanName = cleanShoppingItemName(name);
      const normalizedName = normalizeShoppingItemName(name);

      const [item] = await tx
        .insert(shoppingItems)
        .values({
          id: shoppingItemId,
          householdId,
          name: cleanName,
          normalizedName,
          status: "active",
        })
        .onConflictDoUpdate({
          target: [shoppingItems.householdId, shoppingItems.normalizedName],
          set: {
            status: "active",
            updatedAt: new Date(),
          },
        })
        .returning({
          id: shoppingItems.id,
          householdId: shoppingItems.householdId,
          name: shoppingItems.name,
          status: shoppingItems.status,
        });

      if (!item) throw new Error("Shopping item upsert returned no row");

      return { kind: "success", item };
    });
  };
}
