import type { Database } from "@home-hub/database";
import { householdMembers, users } from "@home-hub/database/schema";
import { asc, eq } from "drizzle-orm";
import { findActiveUser } from "../authorization/active-user";
import { findHouseholdMembershipForShare } from "../authorization/household-access";

export type ListHouseholdMembersInput = {
  userId: string;
  householdId: string;
};

export type HouseholdMemberSummary = {
  id: string;
  username: string;
  role: "owner" | "member";
  joinedAt: Date;
};

export type ListHouseholdMembersResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "success"; members: HouseholdMemberSummary[] };

export function createListHouseholdMembersService({ db }: { db: Database }) {
  return async function listHouseholdMembers({
    userId,
    householdId,
  }: ListHouseholdMembersInput): Promise<ListHouseholdMembersResult> {
    return db.transaction(async (tx) => {
      const user = await findActiveUser(tx, userId);

      if (!user) {
        return { kind: "unauthorized" };
      }

      const callerMembership = await findHouseholdMembershipForShare(tx, {
        householdId,
        userId,
      });

      if (!callerMembership) {
        return { kind: "forbidden" };
      }

      const members = await tx
        .select({
          id: householdMembers.id,
          username: users.username,
          role: householdMembers.role,
          joinedAt: householdMembers.createdAt,
        })
        .from(householdMembers)
        .innerJoin(users, eq(householdMembers.userId, users.id))
        .where(eq(householdMembers.householdId, householdId))
        .orderBy(asc(householdMembers.createdAt), asc(householdMembers.id));

      return { kind: "success", members };
    });
  };
}
