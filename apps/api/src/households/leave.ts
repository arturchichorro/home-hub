import type { Database } from "@home-hub/database";
import { householdMembers } from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";
import { findActiveUser } from "../authorization/active-user";
import { findHouseholdMembershipForUpdate } from "../authorization/household-access";

export type LeaveHouseholdInput = {
  userId: string;
  householdId: string;
};

export type LeaveHouseholdResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "owner_must_transfer" }
  | { kind: "success" };

export function createLeaveHouseholdService({ db }: { db: Database }) {
  return async function leaveHousehold({
    userId,
    householdId,
  }: LeaveHouseholdInput): Promise<LeaveHouseholdResult> {
    return db.transaction(async (tx) => {
      const user = await findActiveUser(tx, userId);

      if (!user) {
        return { kind: "unauthorized" };
      }

      const membership = await findHouseholdMembershipForUpdate(tx, {
        householdId,
        userId,
      });

      if (!membership) {
        return { kind: "forbidden" };
      }

      if (membership.role === "owner") {
        return { kind: "owner_must_transfer" };
      }

      await tx
        .delete(householdMembers)
        .where(
          and(
            eq(householdMembers.id, membership.id),
            eq(householdMembers.householdId, householdId),
          ),
        );

      return { kind: "success" };
    });
  };
}
