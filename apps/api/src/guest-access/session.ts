import { randomUUID } from "node:crypto";
import type { Database } from "@home-hub/database";
import {
  householdGuestAccessLinks,
  householdGuestSessions,
  households,
} from "@home-hub/database/schema";
import type { GuestAccessLevel } from "@home-hub/shared/guest-access";
import { and, eq, isNull } from "drizzle-orm";
import { signGuestAccessToken } from "../auth/access-token";
import { generateGuestAccessToken, hashGuestAccessToken } from "./token";

export type GuestSessionDetails = {
  accessToken: string;
  access: GuestAccessLevel;
  cacheIdentity: string;
  household: { id: string; name: string };
  sessionToken: string;
};

type GuestSessionFailure = { kind: "invalid_token" };
type GuestSessionSuccess = { kind: "success"; session: GuestSessionDetails };

const activeLinkSelection = {
  id: householdGuestAccessLinks.id,
  householdId: householdGuestAccessLinks.householdId,
  householdName: households.name,
  access: householdGuestAccessLinks.access,
};

function sessionDetails(input: {
  sessionId: string;
  sessionToken: string;
  householdId: string;
  householdName: string;
  access: GuestAccessLevel;
  jwtSecret: string;
  now: Date;
}): GuestSessionDetails {
  return {
    accessToken: signGuestAccessToken({
      guestSessionId: input.sessionId,
      jwtId: randomUUID(),
      secret: input.jwtSecret,
      now: input.now,
    }),
    access: input.access,
    cacheIdentity: `guest:${input.sessionId}`,
    household: { id: input.householdId, name: input.householdName },
    sessionToken: input.sessionToken,
  };
}

export function createRedeemGuestAccessService({
  db,
  jwtSecret,
}: {
  db: Database;
  jwtSecret: string;
}) {
  return async function redeemGuestAccess(
    rawToken: string,
  ): Promise<GuestSessionFailure | GuestSessionSuccess> {
    return db.transaction(async (tx) => {
      const [link] = await tx
        .select(activeLinkSelection)
        .from(householdGuestAccessLinks)
        .innerJoin(
          households,
          eq(households.id, householdGuestAccessLinks.householdId),
        )
        .where(
          and(
            eq(
              householdGuestAccessLinks.tokenHash,
              hashGuestAccessToken(rawToken),
            ),
            isNull(householdGuestAccessLinks.disabledAt),
            isNull(households.deletedAt),
          ),
        )
        .limit(1)
        .for("share");
      if (!link) return { kind: "invalid_token" };

      const sessionId = randomUUID();
      const sessionToken = generateGuestAccessToken();
      const now = new Date();
      await tx.insert(householdGuestSessions).values({
        id: sessionId,
        guestAccessLinkId: link.id,
        tokenHash: hashGuestAccessToken(sessionToken),
        createdAt: now,
        updatedAt: now,
      });

      return {
        kind: "success",
        session: sessionDetails({
          sessionId,
          sessionToken,
          householdId: link.householdId,
          householdName: link.householdName,
          access: link.access,
          jwtSecret,
          now,
        }),
      };
    });
  };
}

export function createRefreshGuestAccessService({
  db,
  jwtSecret,
}: {
  db: Database;
  jwtSecret: string;
}) {
  return async function refreshGuestAccess(
    rawSessionToken: string,
  ): Promise<GuestSessionFailure | GuestSessionSuccess> {
    return db.transaction(async (tx) => {
      const [session] = await tx
        .select({
          sessionId: householdGuestSessions.id,
          householdId: householdGuestAccessLinks.householdId,
          householdName: households.name,
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
            eq(
              householdGuestSessions.tokenHash,
              hashGuestAccessToken(rawSessionToken),
            ),
            isNull(householdGuestSessions.revokedAt),
            isNull(householdGuestAccessLinks.disabledAt),
            isNull(households.deletedAt),
          ),
        )
        .limit(1)
        .for("share");
      if (!session) return { kind: "invalid_token" };

      const now = new Date();
      await tx
        .update(householdGuestSessions)
        .set({ updatedAt: now })
        .where(eq(householdGuestSessions.id, session.sessionId));

      return {
        kind: "success",
        session: sessionDetails({
          sessionId: session.sessionId,
          sessionToken: rawSessionToken,
          householdId: session.householdId,
          householdName: session.householdName,
          access: session.access,
          jwtSecret,
          now,
        }),
      };
    });
  };
}

export function createLogoutGuestAccessService({ db }: { db: Database }) {
  return async function logoutGuestAccess(rawSessionToken: string) {
    const now = new Date();
    await db
      .update(householdGuestSessions)
      .set({ revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(
            householdGuestSessions.tokenHash,
            hashGuestAccessToken(rawSessionToken),
          ),
          isNull(householdGuestSessions.revokedAt),
        ),
      );
  };
}
