import type { Database } from "@home-hub/database";
import { householdMembers, households } from "@home-hub/database/schema";
import { asc, desc, eq } from "drizzle-orm";
import { findActiveUser } from "../authorization/active-user";

export type HouseholdSummary = {
  id: string;
  name: string;
  role: "owner" | "member";
};

export type ListHouseholdsResult =
  | { kind: "unauthorized" }
  | { kind: "success"; households: HouseholdSummary[] };

export function createListHouseholdsService({ db }: { db: Database }) {
  return async function listHouseholds(
    userId: string,
  ): Promise<ListHouseholdsResult> {
    const user = await findActiveUser(db, userId);

    if (!user) {
      return { kind: "unauthorized" };
    }

    const visibleHouseholds = await db
      .select({
        id: households.id,
        name: households.name,
        role: householdMembers.role,
      })
      .from(householdMembers)
      .innerJoin(households, eq(householdMembers.householdId, households.id))
      .where(eq(householdMembers.userId, userId))
      .orderBy(desc(households.createdAt), asc(households.id));

    return {
      kind: "success",
      households: visibleHouseholds,
    };
  };
}
