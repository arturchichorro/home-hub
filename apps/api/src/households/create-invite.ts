import { randomUUID } from "node:crypto";
import type { Database } from "@home-hub/database";
import { householdInvites } from "@home-hub/database/schema";
import { findActiveUser } from "../authorization/active-user";
import { findHouseholdOwnerForShare } from "../authorization/household-access";
import { generateInviteToken, hashInviteToken } from "./invite-token";

const inviteTtlMilliseconds = 7 * 24 * 60 * 60 * 1000;

export type CreateHouseholdInviteInput = {
  userId: string;
  householdId: string;
};

export type CreateHouseholdInviteResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | {
      kind: "success";
      invite: {
        id: string;
        householdId: string;
        createdAt: Date;
        expiresAt: Date;
        token: string;
      };
    };

export function createHouseholdInviteService({ db }: { db: Database }) {
  return async function createHouseholdInvite({
    userId,
    householdId,
  }: CreateHouseholdInviteInput): Promise<CreateHouseholdInviteResult> {
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

      const inviteId = randomUUID();
      const token = generateInviteToken();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + inviteTtlMilliseconds);

      await tx.insert(householdInvites).values({
        id: inviteId,
        householdId,
        creatorId: userId,
        tokenHash: hashInviteToken(token),
        expiresAt,
        createdAt: now,
        updatedAt: now,
      });

      return {
        kind: "success",
        invite: {
          id: inviteId,
          householdId,
          createdAt: now,
          expiresAt,
          token,
        },
      };
    });
  };
}
