import type { DatabaseTransaction } from "@home-hub/database";
import { shoppingItems } from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";

export async function findShoppingItemForUpdate(
  tx: DatabaseTransaction,
  { householdId, itemId }: { householdId: string; itemId: string },
) {
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

  return item;
}
