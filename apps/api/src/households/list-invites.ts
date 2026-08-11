import type { Database } from "@home-hub/database";
import { householdInvites } from "@home-hub/database/schema";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { findActiveUser } from "../authorization/active-user";
import { findHouseholdOwnerForShare } from "../authorization/household-access";

export type ListHouseholdInvitesInput = {
  userId: string;
  householdId: string;
};

export type PendingHouseholdInviteSummary = {
  id: string;
  createdAt: Date;
  expiresAt: Date;
};

export type ListHouseholdInvitesResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "success"; invites: PendingHouseholdInviteSummary[] };

export function createListHouseholdInvitesService({ db }: { db: Database }) {
  return async function listHouseholdInvites({
    userId,
    householdId,
  }: ListHouseholdInvitesInput): Promise<ListHouseholdInvitesResult> {
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
      const invites = await tx
        .select({
          id: householdInvites.id,
          createdAt: householdInvites.createdAt,
          expiresAt: householdInvites.expiresAt,
        })
        .from(householdInvites)
        .where(
          and(
            eq(householdInvites.householdId, householdId),
            isNull(householdInvites.acceptedAt),
            isNull(householdInvites.revokedAt),
            gt(householdInvites.expiresAt, now),
          ),
        )
        .orderBy(asc(householdInvites.createdAt), asc(householdInvites.id));

      return { kind: "success", invites };
    });
  };
}
