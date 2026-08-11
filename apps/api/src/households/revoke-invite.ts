import type { Database } from "@home-hub/database";
import { householdInvites } from "@home-hub/database/schema";
import { eq } from "drizzle-orm";
import { findActiveUser } from "../authorization/active-user";
import { findHouseholdOwnerForShare } from "../authorization/household-access";
import { findActiveHouseholdInviteForUpdate } from "./scoped-entities";

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
      const user = await findActiveUser(tx, userId);

      if (!user) {
        return { kind: "unauthorized" };
      }

      const ownerMembership = await findHouseholdOwnerForShare(tx, {
        householdId,
        userId,
      });

      if (!ownerMembership) {
        return { kind: "forbidden" };
      }

      const now = new Date();
      const invite = await findActiveHouseholdInviteForUpdate(tx, {
        householdId,
        inviteId,
        now,
      });

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
