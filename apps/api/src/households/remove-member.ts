import type { createDbClient } from "@home-hub/database/client";
import { householdMembers } from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";

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

type Database = ReturnType<typeof createDbClient>["db"];

export function createRemoveHouseholdMemberService({ db }: { db: Database }) {
  return async function removeHouseholdMember({
    userId,
    householdId,
    membershipId,
  }: RemoveHouseholdMemberInput): Promise<RemoveHouseholdMemberResult> {
    return db.transaction(async (tx) => {
      const user = await tx.query.users.findFirst({
        columns: { id: true },
        where: (users, { eq }) => eq(users.id, userId),
      });

      if (!user) {
        return { kind: "unauthorized" };
      }

      const [callerMembership] = await tx
        .select({ id: householdMembers.id, role: householdMembers.role })
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, householdId),
            eq(householdMembers.userId, userId),
          ),
        )
        .limit(1)
        .for("share");

      if (callerMembership?.role !== "owner") {
        return { kind: "forbidden" };
      }

      const [targetMembership] = await tx
        .select({ id: householdMembers.id, role: householdMembers.role })
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.id, membershipId),
            eq(householdMembers.householdId, householdId),
          ),
        )
        .limit(1)
        .for("update");

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
