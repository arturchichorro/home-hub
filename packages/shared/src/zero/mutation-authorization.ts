import type { Transaction } from "@rocicorp/zero";
import type { HouseholdModuleKey } from "../modules";
import type { ZeroAuthContext } from "./context";
import { type Schema, zql } from "./schema.gen";

export async function requireServerHouseholdModuleAccess({
  tx,
  householdId,
  ctx,
  moduleKey,
}: {
  tx: Transaction<Schema>;
  householdId: string;
  ctx: ZeroAuthContext;
  moduleKey: HouseholdModuleKey;
}): Promise<void> {
  if (tx.location !== "server") {
    return;
  }

  if (ctx.guest) {
    const rows = await tx.dbTransaction.query(
      `SELECT l.id FROM public.household_guest_access_links l
       JOIN public.households h ON h.id = l.household_id
       JOIN public.household_module_settings m ON m.household_id = h.id
       WHERE l.id = $1 AND l.household_id = $2 AND l.access = 'write'
         AND l.disabled_at IS NULL AND l.expires_at > clock_timestamp()
         AND h.deleted_at IS NULL AND m.module_key = $3 AND m.enabled
       FOR SHARE OF l, h, m`,
      [ctx.guest.id, householdId, moduleKey],
    );
    if (!Array.from(rows).length)
      throw new Error("Household module mutation not allowed");
    return;
  }
  const userId = ctx.userId;
  const rows = await tx.dbTransaction.query(
    `SELECT m.id FROM public.household_members m
     JOIN public.households h ON h.id = m.household_id
     JOIN public.household_module_settings s ON s.household_id = h.id
     WHERE m.user_id = $1 AND m.household_id = $2 AND h.deleted_at IS NULL
       AND s.module_key = $3 AND s.enabled FOR SHARE OF m, h, s`,
    [userId, householdId, moduleKey],
  );
  if (!Array.from(rows).length)
    throw new Error("Household module mutation not allowed");
  const membership = await tx.run(
    zql.householdMembers
      .where("householdId", householdId)
      .where("userId", userId)
      .whereExists("household", (household) =>
        household.where("deletedAt", "IS", null),
      )
      .one(),
  );

  if (!membership) {
    throw new Error("Household module mutation not allowed");
  }

  const setting = await tx.run(
    zql.householdModuleSettings
      .where("householdId", householdId)
      .where("moduleKey", moduleKey)
      .where("enabled", true)
      .one(),
  );

  if (!setting) {
    throw new Error("Household module mutation not allowed");
  }
}
