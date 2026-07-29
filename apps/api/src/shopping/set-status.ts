import type { createDbClient } from "@home-hub/database/client";
import { householdMembers, shoppingItems } from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";

type Database = ReturnType<typeof createDbClient>["db"];
type ShoppingItemRow = typeof shoppingItems.$inferSelect;

export type SetShoppingItemStatusInput = {
  userId: string;
  householdId: string;
  itemId: string;
  status: ShoppingItemRow["status"];
};

export type SetShoppingItemStatusResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | {
      kind: "success";
      item: {
        id: string;
        householdId: string;
        name: string;
        status: ShoppingItemRow["status"];
      };
    };

export function createSetShoppingItemStatusService({ db }: { db: Database }) {
  return async function setShoppingItemStatus({
    userId,
    householdId,
    itemId,
    status,
  }: SetShoppingItemStatusInput): Promise<SetShoppingItemStatusResult> {
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

      const [item] = await tx
        .select({
          id: shoppingItems.id,
          householdId: shoppingItems.householdId,
          name: shoppingItems.name,
          status: shoppingItems.status,
        })
        .from(shoppingItems)
        .where(
          and(
            eq(shoppingItems.id, itemId),
            eq(shoppingItems.householdId, householdId),
          ),
        )
        .limit(1)
        .for("update");

      if (!item) {
        return { kind: "not_found" };
      }

      if (item.status === status) {
        return { kind: "success", item };
      }

      const [updatedItem] = await tx
        .update(shoppingItems)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(shoppingItems.id, itemId),
            eq(shoppingItems.householdId, householdId),
          ),
        )
        .returning({
          id: shoppingItems.id,
          householdId: shoppingItems.householdId,
          name: shoppingItems.name,
          status: shoppingItems.status,
        });

      if (!updatedItem)
        throw new Error("Shopping item status update returned no row");

      return { kind: "success", item: updatedItem };
    });
  };
}
