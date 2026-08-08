import type { createDbClient } from "@home-hub/database/client";
import { householdMembers } from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";

type Database = ReturnType<typeof createDbClient>["db"];

export type TransferHouseholdOwnershipInput = {
  userId: string;
  householdId: string;
  membershipId: string;
};

export type TransferHouseholdOwnershipResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "invalid_member" }
  | { kind: "success" };

export function createTransferHouseholdOwnershipService({
  db,
}: {
  db: Database;
}) {
  return async function transferHouseholdOwnership({
    userId,
    householdId,
    membershipId,
  }: TransferHouseholdOwnershipInput): Promise<TransferHouseholdOwnershipResult> {
    return db.transaction(async (tx) => {
      const user = await tx.query.users.findFirst({
        columns: { id: true },
        where: (users, { eq }) => eq(users.id, userId),
      });

      if (!user) {
        return { kind: "unauthorized" };
      }

      const [currentOwner] = await tx
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

      if (currentOwner?.role !== "owner") {
        return { kind: "forbidden" };
      }

      const [targetMember] = await tx
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

      if (targetMember?.role !== "member") {
        return { kind: "invalid_member" };
      }

      const now = new Date();
      const [demotedOwner] = await tx
        .update(householdMembers)
        .set({ role: "member", updatedAt: now })
        .where(
          and(
            eq(householdMembers.id, currentOwner.id),
            eq(householdMembers.householdId, householdId),
            eq(householdMembers.role, "owner"),
          ),
        )
        .returning({ id: householdMembers.id });

      if (!demotedOwner) {
        throw new Error("Locked household owner could not be demoted");
      }

      const [promotedMember] = await tx
        .update(householdMembers)
        .set({ role: "owner", updatedAt: now })
        .where(
          and(
            eq(householdMembers.id, targetMember.id),
            eq(householdMembers.householdId, householdId),
            eq(householdMembers.role, "member"),
          ),
        )
        .returning({ id: householdMembers.id });

      if (!promotedMember) {
        throw new Error("Locked household member could not be promoted");
      }

      return { kind: "success" };
    });
  };
}
