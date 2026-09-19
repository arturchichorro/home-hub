import type { DatabaseTransaction } from "@home-hub/database";
import {
  householdGuestAccessLinks,
  households,
} from "@home-hub/database/schema";
import {
  type GuestRequestAccess,
  isGuestRequestAccess,
  type RequestAccess,
} from "@home-hub/shared/access";
import type { HouseholdModuleKey } from "@home-hub/shared/modules";
import { and, eq, gt, isNull } from "drizzle-orm";
import { findActiveUser } from "./active-user";
import {
  findEnabledHouseholdModuleForShare,
  findHouseholdMembershipForShare,
} from "./household-access";

export async function lockCurrentGuestAccess(
  tx: DatabaseTransaction,
  requestAccess: Extract<RequestAccess, { actor: { kind: "guest" } }>,
): Promise<GuestRequestAccess | undefined> {
  const [current] = await tx
    .select({
      guestAccessLinkId: householdGuestAccessLinks.id,
      householdId: householdGuestAccessLinks.householdId,
      access: householdGuestAccessLinks.access,
    })
    .from(householdGuestAccessLinks)
    .innerJoin(
      households,
      eq(households.id, householdGuestAccessLinks.householdId),
    )
    .where(
      and(
        eq(householdGuestAccessLinks.id, requestAccess.actor.guestAccessLinkId),
        isNull(householdGuestAccessLinks.disabledAt),
        gt(householdGuestAccessLinks.expiresAt, new Date()),
        isNull(households.deletedAt),
      ),
    )
    .limit(1)
    .for("share");

  return current
    ? {
        actor: {
          kind: "guest",
          guestAccessLinkId: current.guestAccessLinkId,
        },
        householdScope: {
          householdId: current.householdId,
          permission: current.access,
        },
      }
    : undefined;
}

export async function authorizeHouseholdModule(
  tx: DatabaseTransaction,
  input: {
    requestAccess: RequestAccess;
    householdId: string;
    moduleKey: HouseholdModuleKey;
    write: boolean;
  },
): Promise<"unauthorized" | "forbidden" | undefined> {
  if (!isGuestRequestAccess(input.requestAccess)) {
    const accountId = input.requestAccess.actor.accountId;
    const user = await findActiveUser(tx, accountId);
    if (!user) return "unauthorized";
    const membership = await findHouseholdMembershipForShare(tx, {
      householdId: input.householdId,
      userId: accountId,
    });
    if (!membership) return "forbidden";
  } else {
    const current = await lockCurrentGuestAccess(tx, input.requestAccess);
    if (
      !current ||
      current.householdScope.householdId !== input.householdId ||
      (input.write && current.householdScope.permission !== "write")
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
