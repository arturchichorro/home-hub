import type { Database } from "@home-hub/database";
import {
  householdMembers,
  householdModuleSettings,
} from "@home-hub/database/schema";
import type { HouseholdModuleKey } from "@home-hub/shared/modules";
import { and, eq } from "drizzle-orm";

export type SetHouseholdModuleEnabledInput = {
  userId: string;
  householdId: string;
  moduleKey: HouseholdModuleKey;
  enabled: boolean;
};

export type SetHouseholdModuleEnabledResult =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "module_not_configured" }
  | {
      kind: "success";
      setting: { moduleKey: HouseholdModuleKey; enabled: boolean };
    };

export function createSetHouseholdModuleEnabledService({
  db,
}: {
  db: Database;
}) {
  return async function setHouseholdModuleEnabled({
    userId,
    householdId,
    moduleKey,
    enabled,
  }: SetHouseholdModuleEnabledInput): Promise<SetHouseholdModuleEnabledResult> {
    return db.transaction(async (tx) => {
      const user = await tx.query.users.findFirst({
        columns: { id: true },
        where: (users, { eq }) => eq(users.id, userId),
      });
      if (!user) return { kind: "unauthorized" };

      const [owner] = await tx
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
      if (!owner) return { kind: "forbidden" };

      const [setting] = await tx
        .select({ moduleKey: householdModuleSettings.moduleKey })
        .from(householdModuleSettings)
        .where(
          and(
            eq(householdModuleSettings.householdId, householdId),
            eq(householdModuleSettings.moduleKey, moduleKey),
          ),
        )
        .limit(1)
        .for("update");
      if (!setting) return { kind: "module_not_configured" };

      const [updated] = await tx
        .update(householdModuleSettings)
        .set({ enabled, updatedAt: new Date() })
        .where(
          and(
            eq(householdModuleSettings.householdId, householdId),
            eq(householdModuleSettings.moduleKey, moduleKey),
          ),
        )
        .returning({
          moduleKey: householdModuleSettings.moduleKey,
          enabled: householdModuleSettings.enabled,
        });
      if (!updated)
        throw new Error("Locked module setting could not be updated");

      return {
        kind: "success",
        setting: { moduleKey, enabled: updated.enabled },
      };
    });
  };
}
