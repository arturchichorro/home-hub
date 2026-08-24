import { randomUUID } from "node:crypto";
import type { Database } from "@home-hub/database";
import { shoppingItems } from "@home-hub/database/schema";
import {
  cleanShoppingItemName,
  normalizeShoppingItemName,
} from "@home-hub/shared/normalization";
import { sql } from "drizzle-orm";
import { findActiveUser } from "../authorization/active-user";
import {
  findEnabledHouseholdModuleForShare,
  findHouseholdMembershipForShare,
} from "../authorization/household-access";

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
      const user = await findActiveUser(tx, userId);

      if (!user) {
        return { kind: "unauthorized" };
      }

      const membership = await findHouseholdMembershipForShare(tx, {
        householdId,
        userId,
      });

      if (!membership) {
        return { kind: "forbidden" };
      }

      const moduleSetting = await findEnabledHouseholdModuleForShare(tx, {
        householdId,
        moduleKey: "shopping",
      });

      if (!moduleSetting) {
        return { kind: "forbidden" };
      }

      const shoppingItemId = randomUUID();
      const cleanName = cleanShoppingItemName(name);
      const normalizedName = normalizeShoppingItemName(name);
      const nextSortKey = sql<number>`coalesce((
        select max(${shoppingItems.sortKey}) + 1024
        from ${shoppingItems}
        where ${shoppingItems.householdId} = ${householdId}
          and ${shoppingItems.status} = 'active'
      ), 1024)`;

      const [item] = await tx
        .insert(shoppingItems)
        .values({
          id: shoppingItemId,
          householdId,
          name: cleanName,
          normalizedName,
          status: "active",
          sortKey: nextSortKey,
        })
        .onConflictDoUpdate({
          target: [shoppingItems.householdId, shoppingItems.normalizedName],
          set: {
            status: "active",
            sortKey: nextSortKey,
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
