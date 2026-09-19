import type { Database } from "@home-hub/database";
import {
  householdGuestAccessLinks,
  householdModuleSettings,
  households,
} from "@home-hub/database/schema";
import {
  isGuestRequestAccess,
  type RequestAccess,
} from "@home-hub/shared/access";
import type { GuestAccessLevel } from "@home-hub/shared/guest-access";
import type { HouseholdModuleKey } from "@home-hub/shared/modules";
import { and, eq, gt, isNull } from "drizzle-orm";

export type GuestAccessContext = {
  guestAccessLinkId: string;
  access: GuestAccessLevel;
  cacheIdentity: string;
  expiresAt: Date;
  enabledModules: HouseholdModuleKey[];
  household: { id: string; name: string };
};

export function createGuestAccessContextService({
  db,
  now = () => new Date(),
}: {
  db: Database;
  now?: () => Date;
}) {
  return async function getGuestAccessContext(
    requestAccess: RequestAccess,
  ): Promise<
    { kind: "unavailable" } | { kind: "success"; context: GuestAccessContext }
  > {
    if (!isGuestRequestAccess(requestAccess)) return { kind: "unavailable" };

    return db.transaction(async (tx) => {
      const [link] = await tx
        .select({
          id: householdGuestAccessLinks.id,
          householdId: householdGuestAccessLinks.householdId,
          householdName: households.name,
          access: householdGuestAccessLinks.access,
          expiresAt: householdGuestAccessLinks.expiresAt,
        })
        .from(householdGuestAccessLinks)
        .innerJoin(
          households,
          eq(households.id, householdGuestAccessLinks.householdId),
        )
        .where(
          and(
            eq(
              householdGuestAccessLinks.id,
              requestAccess.actor.guestAccessLinkId,
            ),
            eq(
              householdGuestAccessLinks.householdId,
              requestAccess.householdScope.householdId,
            ),
            isNull(householdGuestAccessLinks.disabledAt),
            gt(householdGuestAccessLinks.expiresAt, now()),
            isNull(households.deletedAt),
          ),
        )
        .limit(1);
      if (!link) return { kind: "unavailable" };

      const settings = await tx
        .select({ moduleKey: householdModuleSettings.moduleKey })
        .from(householdModuleSettings)
        .where(
          and(
            eq(householdModuleSettings.householdId, link.householdId),
            eq(householdModuleSettings.moduleKey, "recipes"),
            eq(householdModuleSettings.enabled, true),
          ),
        );

      return {
        kind: "success",
        context: {
          guestAccessLinkId: link.id,
          access: link.access,
          cacheIdentity: `guest-link:${link.id}`,
          expiresAt: link.expiresAt,
          enabledModules: settings.map(() => "recipes" as const),
          household: { id: link.householdId, name: link.householdName },
        },
      };
    });
  };
}
