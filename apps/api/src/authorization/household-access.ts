import type { DatabaseTransaction } from "@home-hub/database";
import {
  householdMembers,
  householdModuleSettings,
} from "@home-hub/database/schema";
import type { HouseholdModuleKey } from "@home-hub/shared/modules";
import { and, eq } from "drizzle-orm";

type HouseholdAccessInput = {
  householdId: string;
  userId: string;
};

export async function findHouseholdMembershipWithoutLock(
  tx: DatabaseTransaction,
  { householdId, userId }: HouseholdAccessInput,
) {
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
    .execute();

  return membership;
}

export async function findHouseholdMembershipForShare(
  tx: DatabaseTransaction,
  { householdId, userId }: HouseholdAccessInput,
) {
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

  return membership;
}

export async function findHouseholdMembershipWithRoleForShare(
  tx: DatabaseTransaction,
  { householdId, userId }: HouseholdAccessInput,
) {
  const [membership] = await tx
    .select({ id: householdMembers.id, role: householdMembers.role })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId),
      ),
    )
    .limit(1)
    .for("share");

  return membership;
}

export async function findHouseholdMembershipForUpdate(
  tx: DatabaseTransaction,
  { householdId, userId }: HouseholdAccessInput,
) {
  const [membership] = await tx
    .select({ id: householdMembers.id, role: householdMembers.role })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId),
      ),
    )
    .limit(1)
    .for("update");

  return membership;
}

export async function findHouseholdOwnerForShare(
  tx: DatabaseTransaction,
  { householdId, userId }: HouseholdAccessInput,
) {
  const [owner] = await tx
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId),
        eq(householdMembers.role, "owner"),
      ),
    )
    .limit(1)
    .for("share");

  return owner;
}

export async function findHouseholdOwnerForUpdate(
  tx: DatabaseTransaction,
  { householdId, userId }: HouseholdAccessInput,
) {
  const [owner] = await tx
    .select({ id: householdMembers.id, role: householdMembers.role })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId),
        eq(householdMembers.role, "owner"),
      ),
    )
    .limit(1)
    .for("update");

  return owner;
}

export async function findEnabledHouseholdModuleForShare(
  tx: DatabaseTransaction,
  {
    householdId,
    moduleKey,
  }: { householdId: string; moduleKey: HouseholdModuleKey },
) {
  const [setting] = await tx
    .select({ householdId: householdModuleSettings.householdId })
    .from(householdModuleSettings)
    .where(
      and(
        eq(householdModuleSettings.householdId, householdId),
        eq(householdModuleSettings.moduleKey, moduleKey),
        eq(householdModuleSettings.enabled, true),
      ),
    )
    .limit(1)
    .for("share");

  return setting;
}
