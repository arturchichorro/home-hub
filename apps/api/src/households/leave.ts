import type { Database } from "@home-hub/database";
import { householdMembers } from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";

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
      const user = await tx.query.users.findFirst({
        columns: { id: true },
        where: (users, { eq }) => eq(users.id, userId),
      });

      if (!user) {
        return { kind: "unauthorized" };
      }

      const [membership] = await tx
        .select({ id: householdMembers.id, role: householdMembers.role })
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, householdId),
            eq(householdMembers.userId, userId),
          ),
        )
        .limit(1)
        .for("update");

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
