import type { Database } from "@home-hub/database";
import {
  householdGuestAccessLinks,
  householdGuestSessions,
  households,
} from "@home-hub/database/schema";
import type { AccessPrincipal } from "@home-hub/shared/access";
import { and, eq, isNull } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { verifyAccessToken } from "../auth/access-token";

export type PrincipalEnv = {
  Variables: { principal: AccessPrincipal; userId: string };
};

export function principalServiceInput(
  principal: AccessPrincipal | undefined,
  legacyUserId?: string,
) {
  if (!principal) {
    if (!legacyUserId) throw new Error("Missing access principal");
    return { userId: legacyUserId } as const;
  }
  return principal.kind === "account"
    ? ({ userId: principal.userId } as const)
    : ({ principal } as const);
}

async function findGuestPrincipal(
  db: Database,
  guestSessionId: string,
): Promise<AccessPrincipal | undefined> {
  const [row] = await db
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
        eq(householdGuestSessions.id, guestSessionId),
        isNull(householdGuestSessions.revokedAt),
        isNull(householdGuestAccessLinks.disabledAt),
        isNull(households.deletedAt),
      ),
    )
    .limit(1);

  return row
    ? {
        kind: "guest",
        guestSessionId,
        guestAccessLinkId: row.guestAccessLinkId,
        householdId: row.householdId,
        access: row.access,
      }
    : undefined;
}

export function createAccessPrincipalAuth(input: {
  db: Database;
  jwtSecret: string;
}) {
  return createMiddleware<PrincipalEnv>(async (c, next) => {
    const authorization = c.req.header("Authorization");
    const parts = authorization?.trim().split(/\s+/);
    if (
      parts?.length !== 2 ||
      parts[0]?.toLowerCase() !== "bearer" ||
      !parts[1]
    ) {
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const claims = verifyAccessToken({
        token: parts[1],
        secret: input.jwtSecret,
      });
      let principal: AccessPrincipal;
      if (claims.principalType) {
        const guest = await findGuestPrincipal(input.db, claims.sub);
        if (!guest) throw new Error("Invalid Guest session");
        principal = guest;
      } else {
        principal = { kind: "account", userId: claims.sub };
      }
      c.set("principal", principal);
    } catch {
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "Unauthorized" }, 401);
    }

    await next();
  });
}
