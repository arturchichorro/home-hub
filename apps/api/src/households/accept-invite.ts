import { randomUUID } from "node:crypto";
import type { createDbClient } from "@home-hub/database/client";
import { householdInvites, householdMembers } from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";
import { hashInviteToken } from "./invite-token";

type Database = ReturnType<typeof createDbClient>["db"];

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
      const user = await tx.query.users.findFirst({
        columns: { id: true },
        where: (users, { eq }) => eq(users.id, userId),
      });

      if (!user) {
        return { kind: "unauthorized" };
      }

      const tokenHash = hashInviteToken(token);

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

      const now = new Date();
      const isInactive =
        !invite ||
        invite.expiresAt.getTime() <= now.getTime() ||
        invite.acceptedAt !== null ||
        invite.revokedAt !== null;

      if (isInactive) {
        return { kind: "invalid_invite" };
      }

      const [householdMember] = await tx
        .select({ id: householdMembers.id })
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, invite.householdId),
            eq(householdMembers.userId, userId),
          ),
        )
        .limit(1)
        .execute();

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
