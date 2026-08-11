import type { Database } from "@home-hub/database";
import { householdMembers } from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";
import { findActiveUser } from "../authorization/active-user";
import { findHouseholdMembershipWithRoleForShare } from "../authorization/household-access";
import { findHouseholdMemberByIdForUpdate } from "./scoped-entities";

export type RemoveHouseholdMemberInput = {
  userId: string;
  householdId: string;
  membershipId: string;
};

export type RemoveHouseholdMemberResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "invalid_member" }
  | { kind: "success" };

export function createRemoveHouseholdMemberService({ db }: { db: Database }) {
  return async function removeHouseholdMember({
    userId,
    householdId,
    membershipId,
  }: RemoveHouseholdMemberInput): Promise<RemoveHouseholdMemberResult> {
    return db.transaction(async (tx) => {
      const user = await findActiveUser(tx, userId);

      if (!user) {
        return { kind: "unauthorized" };
      }

      const callerMembership = await findHouseholdMembershipWithRoleForShare(
        tx,
        {
          householdId,
          userId,
        },
      );

      if (callerMembership?.role !== "owner") {
        return { kind: "forbidden" };
      }

      const targetMembership = await findHouseholdMemberByIdForUpdate(tx, {
        householdId,
        membershipId,
      });

      if (!targetMembership) {
        return { kind: "invalid_member" };
      }

      if (targetMembership.role === "owner") {
        return { kind: "forbidden" };
      }

      await tx
        .delete(householdMembers)
        .where(
          and(
            eq(householdMembers.id, targetMembership.id),
            eq(householdMembers.householdId, householdId),
          ),
        );

      return { kind: "success" };
    });
  };
}
