import type { DatabaseTransaction } from "@home-hub/database";
import {
  households,
  householdGuestAccessLinks as links,
} from "@home-hub/database/schema";
import type { HouseholdModuleKey } from "@home-hub/shared/modules";
import type { ZeroAuthContext } from "@home-hub/shared/zero/context";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { findActiveUser } from "./active-user";
import {
  findEnabledHouseholdModuleForShare,
  findHouseholdMembershipForShare,
} from "./household-access";

export async function authorizeModule(
  tx: DatabaseTransaction,
  {
    principal,
    householdId,
    moduleKey,
    write,
  }: {
    principal: ZeroAuthContext;
    householdId: string;
    moduleKey: HouseholdModuleKey;
    write: boolean;
  },
) {
  if (principal.guest) {
    const [link] = await tx
      .select({ access: links.access })
      .from(links)
      .where(
        and(
          eq(links.id, principal.guest.id),
          eq(links.householdId, householdId),
          isNull(links.disabledAt),
          gt(links.expiresAt, sql`clock_timestamp()`),
        ),
      )
      .limit(1)
      .for("share");
    if (!link) return "unauthorized" as const;
    if (write && link.access !== "write") return "forbidden" as const;
  } else {
    if (!(await findActiveUser(tx, principal.userId)))
      return "unauthorized" as const;
    if (
      !(await findHouseholdMembershipForShare(tx, {
        householdId,
        userId: principal.userId,
      }))
    )
      return "forbidden" as const;
  }
  const [household] = await tx
    .select({ id: households.id })
    .from(households)
    .where(and(eq(households.id, householdId), isNull(households.deletedAt)))
    .limit(1)
    .for("share");
  if (!household) return "forbidden" as const;
  if (
    !(await findEnabledHouseholdModuleForShare(tx, { householdId, moduleKey }))
  )
    return "forbidden" as const;
  return undefined;
}
