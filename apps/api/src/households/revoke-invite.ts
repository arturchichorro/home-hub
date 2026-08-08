import type { createDbClient } from "@home-hub/database/client";
import { householdInvites, householdMembers } from "@home-hub/database/schema";
import { and, eq, gt, isNull } from "drizzle-orm";

type Database = ReturnType<typeof createDbClient>["db"];

export type RevokeHouseholdInviteInput = {
  userId: string;
  householdId: string;
  inviteId: string;
};

export type RevokeHouseholdInviteResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "invalid_invite" }
  | { kind: "success" };

export function createRevokeHouseholdInviteService({ db }: { db: Database }) {
  return async function revokeHouseholdInvite({
    userId,
    householdId,
    inviteId,
  }: RevokeHouseholdInviteInput): Promise<RevokeHouseholdInviteResult> {
    return db.transaction(async (tx) => {
      const user = await tx.query.users.findFirst({
        columns: { id: true },
        where: (users, { eq }) => eq(users.id, userId),
      });

      if (!user) {
        return { kind: "unauthorized" };
      }

      const [ownerMembership] = await tx
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

      if (!ownerMembership) {
        return { kind: "forbidden" };
      }

      const now = new Date();
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

      if (!invite) {
        return { kind: "invalid_invite" };
      }

      await tx
        .update(householdInvites)
        .set({ revokedAt: now, updatedAt: now })
        .where(eq(householdInvites.id, invite.id));

      return { kind: "success" };
    });
  };
}
