import type { DatabaseTransaction } from "@home-hub/database";
import {
  householdGuestAccessLinks,
  householdGuestSessions,
  households,
} from "@home-hub/database/schema";
import type { AccessPrincipal } from "@home-hub/shared/access";
import type { HouseholdModuleKey } from "@home-hub/shared/modules";
import { and, eq, isNull } from "drizzle-orm";
import { findActiveUser } from "./active-user";
import {
  findEnabledHouseholdModuleForShare,
  findHouseholdMembershipForShare,
} from "./household-access";

export type PrincipalOrLegacyUser =
  | { principal: AccessPrincipal; userId?: never }
  | { principal?: never; userId: string };

export function resolvePrincipal(
  input: PrincipalOrLegacyUser,
): AccessPrincipal {
  return input.principal ?? { kind: "account", userId: input.userId };
}

export async function lockCurrentGuestPrincipal(
  tx: DatabaseTransaction,
  principal: Extract<AccessPrincipal, { kind: "guest" }>,
): Promise<Extract<AccessPrincipal, { kind: "guest" }> | undefined> {
  const [current] = await tx
    .select({
      guestAccessLinkId: householdGuestAccessLinks.id,
      householdId: householdGuestAccessLinks.householdId,
      access: householdGuestAccessLinks.access,
    })
    .from(householdGuestSessions)
    .innerJoin(
      householdGuestAccessLinks,
      eq(
        householdGuestAccessLinks.id,
        householdGuestSessions.guestAccessLinkId,
      ),
    )
    .innerJoin(
      households,
      eq(households.id, householdGuestAccessLinks.householdId),
    )
    .where(
      and(
        eq(householdGuestSessions.id, principal.guestSessionId),
        eq(householdGuestAccessLinks.id, principal.guestAccessLinkId),
        isNull(householdGuestSessions.revokedAt),
        isNull(householdGuestAccessLinks.disabledAt),
        isNull(households.deletedAt),
      ),
    )
    .limit(1)
    .for("share");

  return current
    ? {
        kind: "guest",
        guestSessionId: principal.guestSessionId,
        guestAccessLinkId: current.guestAccessLinkId,
        householdId: current.householdId,
        access: current.access,
      }
    : undefined;
}

export async function authorizeHouseholdModule(
  tx: DatabaseTransaction,
  input: {
    principal: AccessPrincipal;
    householdId: string;
    moduleKey: HouseholdModuleKey;
    write: boolean;
  },
): Promise<"unauthorized" | "forbidden" | undefined> {
  if (input.principal.kind === "account") {
    const user = await findActiveUser(tx, input.principal.userId);
    if (!user) return "unauthorized";
    const membership = await findHouseholdMembershipForShare(tx, {
      householdId: input.householdId,
      userId: input.principal.userId,
    });
    if (!membership) return "forbidden";
  } else {
    const current = await lockCurrentGuestPrincipal(tx, input.principal);
    if (
      !current ||
      current.householdId !== input.householdId ||
      (input.write && current.access !== "write")
    ) {
      return "forbidden";
    }
  }

  const setting = await findEnabledHouseholdModuleForShare(tx, {
    householdId: input.householdId,
    moduleKey: input.moduleKey,
  });
  if (!setting) return "forbidden";
}
