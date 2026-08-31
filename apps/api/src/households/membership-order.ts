import type { DatabaseTransaction } from "@home-hub/database";
import { householdMembers } from "@home-hub/database/schema";
import { desc, eq } from "drizzle-orm";

const sortKeyGap = 1024;
const maxSortKey = 2_147_483_647;

export async function nextHouseholdMembershipSortKey(
  tx: DatabaseTransaction,
  userId: string,
): Promise<number> {
  const [top] = await tx
    .select({ sortKey: householdMembers.sortKey })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .orderBy(desc(householdMembers.sortKey), householdMembers.id)
    .limit(1)
    .execute();
  const next = (top?.sortKey ?? 0) + sortKeyGap;
  if (next > maxSortKey)
    throw new Error("Household ordering requires rebalancing");
  return next;
}
