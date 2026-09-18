import type { Database } from "@home-hub/database";
import {
  householdGuestAccessLinks,
  householdGuestSessions,
  households,
} from "@home-hub/database/schema";
import type { RequestAccess } from "@home-hub/shared/access";
import { and, eq, isNull } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { verifyAccessToken } from "../auth/access-token";

export type RequestAccessEnv = {
  Variables: { requestAccess: RequestAccess };
};

async function loadGuestRequestAccess(
  db: Database,
  guestSessionId: string,
): Promise<RequestAccess | undefined> {
  const [row] = await db
    .select({
      guestAccessLinkId: householdGuestAccessLinks.id,
      householdId: householdGuestAccessLinks.householdId,
      permission: householdGuestAccessLinks.access,
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
        actor: {
          kind: "guest",
          guestSessionId,
          guestAccessLinkId: row.guestAccessLinkId,
        },
        householdScope: {
          householdId: row.householdId,
          permission: row.permission,
        },
      }
    : undefined;
}

export function createRequestAccessAuth(input: {
  db: Database;
  jwtSecret: string;
}) {
  return createMiddleware<RequestAccessEnv>(async (c, next) => {
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
      const requestAccess: RequestAccess | undefined =
        claims.subjectType === "guest-session"
          ? await loadGuestRequestAccess(input.db, claims.sub)
          : { actor: { kind: "account", accountId: claims.sub } };
      if (!requestAccess) throw new Error("Invalid Guest session");
      c.set("requestAccess", requestAccess);
    } catch {
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "Unauthorized" }, 401);
    }

    await next();
  });
}
