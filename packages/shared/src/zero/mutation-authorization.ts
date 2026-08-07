import type { Transaction } from "@rocicorp/zero";
import { type Schema, zql } from "./schema.gen";

export async function requireServerHouseholdMembership({
  tx,
  householdId,
  userId,
}: {
  tx: Transaction<Schema>;
  householdId: string;
  userId: string;
}): Promise<void> {
  if (tx.location !== "server") {
    return;
  }

  const membership = await tx.run(
    zql.householdMembers
      .where("householdId", householdId)
      .where("userId", userId)
      .one(),
  );

  if (!membership) {
    throw new Error("Household mutation not allowed");
  }
}
