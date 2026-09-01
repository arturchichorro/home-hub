import type { Transaction } from "@rocicorp/zero";
import type { HouseholdModuleKey } from "../modules";
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
      .whereExists("household", (household) =>
        household.where("deletedAt", "IS", null),
      )
      .one(),
  );

  if (!membership) {
    throw new Error("Household mutation not allowed");
  }
}

export async function requireServerHouseholdModuleAccess({
  tx,
  householdId,
  userId,
  moduleKey,
}: {
  tx: Transaction<Schema>;
  householdId: string;
  userId: string;
  moduleKey: HouseholdModuleKey;
}): Promise<void> {
  if (tx.location !== "server") {
    return;
  }

  const membership = await tx.run(
    zql.householdMembers
      .where("householdId", householdId)
      .where("userId", userId)
      .whereExists("household", (household) =>
        household.where("deletedAt", "IS", null),
      )
      .one(),
  );

  if (!membership) {
    throw new Error("Household module mutation not allowed");
  }

  const setting = await tx.run(
    zql.householdModuleSettings
      .where("householdId", householdId)
      .where("moduleKey", moduleKey)
      .where("enabled", true)
      .one(),
  );

  if (!setting) {
    throw new Error("Household module mutation not allowed");
  }
}
