import type { Database } from "@home-hub/database";
import { householdModuleSettings } from "@home-hub/database/schema";
import type { HouseholdModuleKey } from "@home-hub/shared/modules";
import { and, eq } from "drizzle-orm";
import { findActiveUser } from "../authorization/active-user";
import { findHouseholdOwnerForShare } from "../authorization/household-access";
import { findHouseholdModuleSettingForUpdate } from "./scoped-entities";

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
      const user = await findActiveUser(tx, userId);
      if (!user) return { kind: "unauthorized" };

      const owner = await findHouseholdOwnerForShare(tx, {
        householdId,
        userId,
      });
      if (!owner) return { kind: "forbidden" };

      const setting = await findHouseholdModuleSettingForUpdate(tx, {
        householdId,
        moduleKey,
      });
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
