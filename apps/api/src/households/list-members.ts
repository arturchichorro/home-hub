import type { createDbClient } from "@home-hub/database/client";
import { householdMembers, users } from "@home-hub/database/schema";
import { and, asc, eq } from "drizzle-orm";

type Database = ReturnType<typeof createDbClient>["db"];

export type ListHouseholdMembersInput = {
  userId: string;
  householdId: string;
};

export type HouseholdMemberSummary = {
  id: string;
  username: string;
  role: "owner" | "member";
  joinedAt: Date;
};

export type ListHouseholdMembersResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "success"; members: HouseholdMemberSummary[] };

export function createListHouseholdMembersService({ db }: { db: Database }) {
  return async function listHouseholdMembers({
    userId,
    householdId,
  }: ListHouseholdMembersInput): Promise<ListHouseholdMembersResult> {
    return db.transaction(async (tx) => {
      const user = await tx.query.users.findFirst({
        columns: { id: true },
        where: (users, { eq }) => eq(users.id, userId),
      });

      if (!user) {
        return { kind: "unauthorized" };
      }

      const [callerMembership] = await tx
        .select({ id: householdMembers.id })
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, householdId),
            eq(householdMembers.userId, userId),
          ),
        )
        .limit(1)
        .for("share");

      if (!callerMembership) {
        return { kind: "forbidden" };
      }

      const members = await tx
        .select({
          id: householdMembers.id,
          username: users.username,
          role: householdMembers.role,
          joinedAt: householdMembers.createdAt,
        })
        .from(householdMembers)
        .innerJoin(users, eq(householdMembers.userId, users.id))
        .where(eq(householdMembers.householdId, householdId))
        .orderBy(asc(householdMembers.createdAt), asc(householdMembers.id));

      return { kind: "success", members };
    });
  };
}
