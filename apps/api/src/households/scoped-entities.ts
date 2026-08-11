import type { DatabaseTransaction } from "@home-hub/database";
import {
  householdInvites,
  householdMembers,
  householdModuleSettings,
} from "@home-hub/database/schema";
import type { HouseholdModuleKey } from "@home-hub/shared/modules";
import { and, eq, gt, isNull } from "drizzle-orm";

export async function findHouseholdMemberByIdForUpdate(
  tx: DatabaseTransaction,
  { householdId, membershipId }: { householdId: string; membershipId: string },
) {
  const [membership] = await tx
    .select({ id: householdMembers.id, role: householdMembers.role })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.id, membershipId),
        eq(householdMembers.householdId, householdId),
      ),
    )
    .limit(1)
    .for("update");

  return membership;
}

export async function findActiveHouseholdInviteForUpdate(
  tx: DatabaseTransaction,
  {
    householdId,
    inviteId,
    now,
  }: { householdId: string; inviteId: string; now: Date },
) {
  const [invite] = await tx
    .select({ id: householdInvites.id })
    .from(householdInvites)
    .where(
      and(
        eq(householdInvites.id, inviteId),
        eq(householdInvites.householdId, householdId),
        isNull(householdInvites.acceptedAt),
        isNull(householdInvites.revokedAt),
        gt(householdInvites.expiresAt, now),
      ),
    )
    .limit(1)
    .for("update");

  return invite;
}

export async function findHouseholdInviteByTokenHashForUpdate(
  tx: DatabaseTransaction,
  tokenHash: string,
) {
  const [invite] = await tx
    .select({
      id: householdInvites.id,
      householdId: householdInvites.householdId,
      expiresAt: householdInvites.expiresAt,
      acceptedAt: householdInvites.acceptedAt,
      revokedAt: householdInvites.revokedAt,
    })
    .from(householdInvites)
    .where(eq(householdInvites.tokenHash, tokenHash))
    .limit(1)
    .for("update");

  return invite;
}

export async function findHouseholdModuleSettingForUpdate(
  tx: DatabaseTransaction,
  {
    householdId,
    moduleKey,
  }: { householdId: string; moduleKey: HouseholdModuleKey },
) {
  const [setting] = await tx
    .select({ moduleKey: householdModuleSettings.moduleKey })
    .from(householdModuleSettings)
    .where(
      and(
        eq(householdModuleSettings.householdId, householdId),
        eq(householdModuleSettings.moduleKey, moduleKey),
      ),
    )
    .limit(1)
    .for("update");

  return setting;
}
