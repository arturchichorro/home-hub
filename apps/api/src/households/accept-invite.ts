import { randomUUID } from "node:crypto";
import type { Database } from "@home-hub/database";
import { householdInvites, householdMembers } from "@home-hub/database/schema";
import { eq } from "drizzle-orm";
import { findActiveUser } from "../authorization/active-user";
import { findHouseholdMembershipWithoutLock } from "../authorization/household-access";
import { hashInviteToken } from "./invite-token";
import { findHouseholdInviteByTokenHashForUpdate } from "./scoped-entities";

export type AcceptHouseholdInviteInput = {
  userId: string;
  token: string;
};

export type AcceptHouseholdInviteResult =
  | { kind: "unauthorized" }
  | { kind: "invalid_invite" }
  | { kind: "already_member" }
  | {
      kind: "success";
      membership: {
        id: string;
        householdId: string;
        role: "member";
      };
    };

export function createAcceptHouseholdInviteService({ db }: { db: Database }) {
  return async function acceptHouseholdInvite({
    userId,
    token,
  }: AcceptHouseholdInviteInput): Promise<AcceptHouseholdInviteResult> {
    return db.transaction(async (tx) => {
      const user = await findActiveUser(tx, userId);

      if (!user) {
        return { kind: "unauthorized" };
      }

      const tokenHash = hashInviteToken(token);

      const invite = await findHouseholdInviteByTokenHashForUpdate(
        tx,
        tokenHash,
      );

      const now = new Date();
      const isInactive =
        !invite ||
        invite.expiresAt.getTime() <= now.getTime() ||
        invite.acceptedAt !== null ||
        invite.revokedAt !== null;

      if (isInactive) {
        return { kind: "invalid_invite" };
      }

      const householdMember = await findHouseholdMembershipWithoutLock(tx, {
        householdId: invite.householdId,
        userId,
      });

      if (householdMember) {
        return { kind: "already_member" };
      }

      const householdMemberId = randomUUID();

      await tx.insert(householdMembers).values({
        id: householdMemberId,
        householdId: invite.householdId,
        userId: user.id,
        role: "member",
      });

      await tx
        .update(householdInvites)
        .set({
          acceptedAt: now,
          updatedAt: now,
        })
        .where(eq(householdInvites.id, invite.id));

      return {
        kind: "success",
        membership: {
          id: householdMemberId,
          householdId: invite.householdId,
          role: "member",
        },
      };
    });
  };
}
