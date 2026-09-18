import { randomUUID } from "node:crypto";
import type { Database, DatabaseTransaction } from "@home-hub/database";
import {
  householdGuestAccessLinks,
  householdGuestSessions,
} from "@home-hub/database/schema";
import type {
  CreateGuestAccessLinkRequest,
  GuestAccessLevel,
  UpdateGuestAccessLinkRequest,
} from "@home-hub/shared/guest-access";
import { and, asc, eq, isNull } from "drizzle-orm";
import { findActiveUser } from "../authorization/active-user";
import { findHouseholdOwnerForShare } from "../authorization/household-access";
import { generateGuestAccessToken, hashGuestLinkToken } from "./token";

export type GuestAccessLinkRecord = {
  id: string;
  householdId: string;
  name: string;
  access: GuestAccessLevel;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ManagementFailure = { kind: "unauthorized" } | { kind: "forbidden" };
type LinkManagementFailure = ManagementFailure | { kind: "not_found" };

const linkSelection = {
  id: householdGuestAccessLinks.id,
  householdId: householdGuestAccessLinks.householdId,
  name: householdGuestAccessLinks.name,
  access: householdGuestAccessLinks.access,
  disabledAt: householdGuestAccessLinks.disabledAt,
  createdAt: householdGuestAccessLinks.createdAt,
  updatedAt: householdGuestAccessLinks.updatedAt,
};

async function requireOwner(
  tx: DatabaseTransaction,
  input: { userId: string; householdId: string },
): Promise<ManagementFailure | undefined> {
  const user = await findActiveUser(tx, input.userId);
  if (!user) return { kind: "unauthorized" };

  const owner = await findHouseholdOwnerForShare(tx, input);
  if (!owner) return { kind: "forbidden" };
}

export function createGuestAccessLinkService({ db }: { db: Database }) {
  return async function createGuestAccessLink(
    input: CreateGuestAccessLinkRequest & {
      userId: string;
      householdId: string;
    },
  ): Promise<
    | ManagementFailure
    | { kind: "success"; link: GuestAccessLinkRecord; token: string }
  > {
    return db.transaction(async (tx) => {
      const failure = await requireOwner(tx, input);
      if (failure) return failure;

      const token = generateGuestAccessToken();
      const now = new Date();
      const [link] = await tx
        .insert(householdGuestAccessLinks)
        .values({
          id: randomUUID(),
          householdId: input.householdId,
          name: input.name,
          access: input.access,
          tokenHash: hashGuestLinkToken(token),
          createdByUserId: input.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning(linkSelection);
      if (!link) throw new Error("Guest access link insert returned no row");

      return { kind: "success", link, token };
    });
  };
}

export function createListGuestAccessLinksService({ db }: { db: Database }) {
  return async function listGuestAccessLinks(input: {
    userId: string;
    householdId: string;
  }): Promise<
    ManagementFailure | { kind: "success"; links: GuestAccessLinkRecord[] }
  > {
    return db.transaction(async (tx) => {
      const failure = await requireOwner(tx, input);
      if (failure) return failure;

      const links = await tx
        .select(linkSelection)
        .from(householdGuestAccessLinks)
        .where(eq(householdGuestAccessLinks.householdId, input.householdId))
        .orderBy(
          asc(householdGuestAccessLinks.createdAt),
          asc(householdGuestAccessLinks.id),
        );

      return { kind: "success", links };
    });
  };
}

export function createUpdateGuestAccessLinkService({ db }: { db: Database }) {
  return async function updateGuestAccessLink(
    input: UpdateGuestAccessLinkRequest & {
      userId: string;
      householdId: string;
      guestAccessLinkId: string;
    },
  ): Promise<
    LinkManagementFailure | { kind: "success"; link: GuestAccessLinkRecord }
  > {
    return db.transaction(async (tx) => {
      const failure = await requireOwner(tx, input);
      if (failure) return failure;

      const [existing] = await tx
        .select(linkSelection)
        .from(householdGuestAccessLinks)
        .where(
          and(
            eq(householdGuestAccessLinks.id, input.guestAccessLinkId),
            eq(householdGuestAccessLinks.householdId, input.householdId),
          ),
        )
        .limit(1)
        .for("update");
      if (!existing) return { kind: "not_found" };

      const now = new Date();
      const [link] = await tx
        .update(householdGuestAccessLinks)
        .set({
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.access === undefined ? {} : { access: input.access }),
          ...(input.enabled === undefined
            ? {}
            : { disabledAt: input.enabled ? null : now }),
          updatedAt: now,
        })
        .where(eq(householdGuestAccessLinks.id, existing.id))
        .returning(linkSelection);
      if (!link) throw new Error("Guest access link update returned no row");

      if (input.enabled === false) {
        await tx
          .update(householdGuestSessions)
          .set({ revokedAt: now, updatedAt: now })
          .where(
            and(
              eq(householdGuestSessions.guestAccessLinkId, existing.id),
              isNull(householdGuestSessions.revokedAt),
            ),
          );
      }

      return { kind: "success", link };
    });
  };
}

export function createRegenerateGuestAccessLinkService({
  db,
}: {
  db: Database;
}) {
  return async function regenerateGuestAccessLink(input: {
    userId: string;
    householdId: string;
    guestAccessLinkId: string;
  }): Promise<
    | LinkManagementFailure
    | { kind: "success"; link: GuestAccessLinkRecord; token: string }
  > {
    return db.transaction(async (tx) => {
      const failure = await requireOwner(tx, input);
      if (failure) return failure;

      const [existing] = await tx
        .select({ id: householdGuestAccessLinks.id })
        .from(householdGuestAccessLinks)
        .where(
          and(
            eq(householdGuestAccessLinks.id, input.guestAccessLinkId),
            eq(householdGuestAccessLinks.householdId, input.householdId),
          ),
        )
        .limit(1)
        .for("update");
      if (!existing) return { kind: "not_found" };

      const token = generateGuestAccessToken();
      const now = new Date();
      const [link] = await tx
        .update(householdGuestAccessLinks)
        .set({ tokenHash: hashGuestLinkToken(token), updatedAt: now })
        .where(eq(householdGuestAccessLinks.id, existing.id))
        .returning(linkSelection);
      if (!link)
        throw new Error("Guest access link regeneration returned no row");

      await tx
        .update(householdGuestSessions)
        .set({ revokedAt: now, updatedAt: now })
        .where(
          and(
            eq(householdGuestSessions.guestAccessLinkId, existing.id),
            isNull(householdGuestSessions.revokedAt),
          ),
        );

      return { kind: "success", link, token };
    });
  };
}
