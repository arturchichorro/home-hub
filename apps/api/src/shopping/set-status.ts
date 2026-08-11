import type { Database } from "@home-hub/database";
import { shoppingItems } from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";
import { findActiveUser } from "../authorization/active-user";
import {
  findEnabledHouseholdModuleForShare,
  findHouseholdMembershipForShare,
} from "../authorization/household-access";
import { findShoppingItemForUpdate } from "./scoped-entities";

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

      const item = await findShoppingItemForUpdate(tx, {
        householdId,
        itemId,
      });

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
