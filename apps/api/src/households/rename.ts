import type { Database } from "@home-hub/database";
import { households } from "@home-hub/database/schema";
import { eq } from "drizzle-orm";
import { findActiveUser } from "../authorization/active-user";
import { findHouseholdOwnerForShare } from "../authorization/household-access";

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
