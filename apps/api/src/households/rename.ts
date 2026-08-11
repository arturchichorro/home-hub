import type { Database } from "@home-hub/database";
import { householdMembers, households } from "@home-hub/database/schema";
import { and, eq } from "drizzle-orm";

export type RenameHouseholdInput = {
  userId: string;
  householdId: string;
  name: string;
};

export type RenameHouseholdResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "success"; household: { id: string; name: string } };

export function createRenameHouseholdService({ db }: { db: Database }) {
  return async function renameHousehold({
    userId,
    householdId,
    name,
  }: RenameHouseholdInput): Promise<RenameHouseholdResult> {
    return db.transaction(async (tx) => {
      const user = await tx.query.users.findFirst({
        columns: { id: true },
        where: (users, { eq }) => eq(users.id, userId),
      });

      if (!user) {
        return { kind: "unauthorized" };
      }

      const [ownerMembership] = await tx
        .select({ id: householdMembers.id })
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, householdId),
            eq(householdMembers.userId, userId),
            eq(householdMembers.role, "owner"),
          ),
        )
        .limit(1)
        .for("share");

      if (!ownerMembership) {
        return { kind: "forbidden" };
      }

      const [household] = await tx
        .update(households)
        .set({ name, updatedAt: new Date() })
        .where(eq(households.id, householdId))
        .returning({ id: households.id, name: households.name });

      if (!household) {
        throw new Error("Owner membership references a missing household");
      }

      return { kind: "success", household };
    });
  };
}
