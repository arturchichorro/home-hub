import type { Database } from "@home-hub/database";
import {
  householdGuestAccessLinks,
  households,
} from "@home-hub/database/schema";
import type { RequestAccess } from "@home-hub/shared/access";
import { and, eq, gt, isNull } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { verifyAccessToken } from "../auth/access-token";
import { hashGuestLinkToken } from "../guest-access/token";

export type RequestAccessEnv = {
  Variables: { requestAccess: RequestAccess };
};

async function loadGuestRequestAccess(
  db: Database,
  rawToken: string,
  now: Date,
): Promise<RequestAccess | undefined> {
  const [row] = await db
    .select({
      guestAccessLinkId: householdGuestAccessLinks.id,
      householdId: householdGuestAccessLinks.householdId,
      permission: householdGuestAccessLinks.access,
    })
    .from(householdGuestAccessLinks)
    .innerJoin(
      households,
      eq(households.id, householdGuestAccessLinks.householdId),
    )
    .where(
      and(
        eq(householdGuestAccessLinks.tokenHash, hashGuestLinkToken(rawToken)),
        isNull(householdGuestAccessLinks.disabledAt),
        gt(householdGuestAccessLinks.expiresAt, now),
        isNull(households.deletedAt),
      ),
    )
    .limit(1);

  return row
    ? {
        actor: {
          kind: "guest",
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
  now?: () => Date;
  acceptZeroGuestEnvelope?: boolean;
}) {
  return createMiddleware<RequestAccessEnv>(async (c, next) => {
    const authorization = c.req.header("Authorization");
    const parts = authorization?.trim().split(/\s+/);
    if (parts?.length !== 2 || !parts[1]) {
      c.header("WWW-Authenticate", "Bearer, Guest");
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const scheme = parts[0]?.toLowerCase();
      let requestAccess: RequestAccess | undefined;
      if (scheme === "bearer") {
        const zeroGuestPrefix = "guest-v1.";
        if (
          input.acceptZeroGuestEnvelope &&
          parts[1].startsWith(zeroGuestPrefix)
        ) {
          requestAccess = await loadGuestRequestAccess(
            input.db,
            parts[1].slice(zeroGuestPrefix.length),
            input.now?.() ?? new Date(),
          );
        } else {
          const claims = verifyAccessToken({
            token: parts[1],
            secret: input.jwtSecret,
          });
          requestAccess = {
            actor: { kind: "account", accountId: claims.sub },
          };
        }
      } else if (scheme === "guest") {
        requestAccess = await loadGuestRequestAccess(
          input.db,
          parts[1],
          input.now?.() ?? new Date(),
        );
      }
      if (!requestAccess) throw new Error("Invalid request credential");
      c.set("requestAccess", requestAccess);
    } catch {
      c.header("WWW-Authenticate", "Bearer, Guest");
      return c.json({ error: "Unauthorized" }, 401);
    }

    await next();
  });
}
