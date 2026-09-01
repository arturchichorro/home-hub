import type { Database } from "@home-hub/database";
import { households } from "@home-hub/database/schema";
import { and, eq, isNull } from "drizzle-orm";
import { findActiveUser } from "../authorization/active-user";
import { findHouseholdOwnerForUpdate } from "../authorization/household-access";

export type DeleteHouseholdInput = {
  householdId: string;
  userId: string;
};

export type DeleteHouseholdResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "success" };

export function createDeleteHouseholdService({ db }: { db: Database }) {
  return async function deleteHousehold({
    householdId,
    userId,
  }: DeleteHouseholdInput): Promise<DeleteHouseholdResult> {
    return db.transaction(async (tx) => {
      const user = await findActiveUser(tx, userId);

      if (!user) return { kind: "unauthorized" };

      const ownerMembership = await findHouseholdOwnerForUpdate(tx, {
        householdId,
        userId,
      });

      if (!ownerMembership) return { kind: "forbidden" };

      const deletedAt = new Date();
      const [deletedHousehold] = await tx
        .update(households)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(
          and(eq(households.id, householdId), isNull(households.deletedAt)),
        )
        .returning({ id: households.id });

      return deletedHousehold ? { kind: "success" } : { kind: "forbidden" };
    });
  };
}
