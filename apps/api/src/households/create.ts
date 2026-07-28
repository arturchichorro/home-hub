import { randomUUID } from "node:crypto";
import type { createDbClient } from "@home-hub/database/client";
import { householdMembers, households } from "@home-hub/database/schema";

type Database = ReturnType<typeof createDbClient>["db"];

export type CreateHouseholdInput = {
  userId: string;
  name: string;
};

export type CreateHouseholdResult =
  | { kind: "unauthorized" }
  | { kind: "success"; household: { id: string; name: string } };

export function createHouseholdService({ db }: { db: Database }) {
  return async function createHousehold({
    userId,
    name,
  }: CreateHouseholdInput): Promise<CreateHouseholdResult> {
    return db.transaction(async (tx) => {
      const user = await tx.query.users.findFirst({
        columns: { id: true },
        where: (users, { eq }) => eq(users.id, userId),
      });

      if (!user) {
        return { kind: "unauthorized" };
      }

      const householdId = randomUUID();
      const householdMemberId = randomUUID();

      await tx.insert(households).values({
        id: householdId,
        name,
      });

      await tx.insert(householdMembers).values({
        id: householdMemberId,
        householdId,
        userId,
        role: "owner",
      });

      return {
        kind: "success",
        household: { id: householdId, name },
      };
    });
  };
}
