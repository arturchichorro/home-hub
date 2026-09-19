import { randomUUID } from "node:crypto";
import type { Database, DatabaseTransaction } from "@home-hub/database";
import { householdGuestAccessLinks } from "@home-hub/database/schema";
import type {
  CreateGuestAccessLinkRequest,
  GuestAccessLevel,
  UpdateGuestAccessLinkRequest,
} from "@home-hub/shared/guest-access";
import { and, asc, eq } from "drizzle-orm";
import { findActiveUser } from "../authorization/active-user";
import { findHouseholdOwnerForShare } from "../authorization/household-access";
import { resolveGuestAccessExpiration } from "./expiration";
import { generateGuestAccessToken, hashGuestLinkToken } from "./token";

export type GuestAccessLinkRecord = {
  id: string;
  householdId: string;
  name: string;
  access: GuestAccessLevel;
  expiresAt: Date;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ManagementFailure = { kind: "unauthorized" } | { kind: "forbidden" };
type LinkManagementFailure = ManagementFailure | { kind: "not_found" };
type ExpirationFailure = { kind: "invalid_expiration" };

const linkSelection = {
  id: householdGuestAccessLinks.id,
  householdId: householdGuestAccessLinks.householdId,
  name: householdGuestAccessLinks.name,
  access: householdGuestAccessLinks.access,
  expiresAt: householdGuestAccessLinks.expiresAt,
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

export function createGuestAccessLinkService({
  db,
  now = () => new Date(),
}: {
  db: Database;
  now?: () => Date;
}) {
  return async function createGuestAccessLink(
    input: CreateGuestAccessLinkRequest & {
      userId: string;
      householdId: string;
    },
  ): Promise<
    | ManagementFailure
    | ExpirationFailure
    | { kind: "success"; link: GuestAccessLinkRecord; token: string }
  > {
    return db.transaction(async (tx) => {
      const failure = await requireOwner(tx, input);
      if (failure) return failure;

      const token = generateGuestAccessToken();
      const createdAt = now();
      const expiresAt = resolveGuestAccessExpiration(
        input.expiresAt,
        createdAt,
      );
      if (!expiresAt) return { kind: "invalid_expiration" };
      const [link] = await tx
        .insert(householdGuestAccessLinks)
        .values({
          id: randomUUID(),
          householdId: input.householdId,
          name: input.name,
          access: input.access,
          tokenHash: hashGuestLinkToken(token),
          expiresAt,
          createdByUserId: input.userId,
          createdAt,
          updatedAt: createdAt,
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

export function createUpdateGuestAccessLinkService({
  db,
  now = () => new Date(),
}: {
  db: Database;
  now?: () => Date;
}) {
  return async function updateGuestAccessLink(
    input: UpdateGuestAccessLinkRequest & {
      userId: string;
      householdId: string;
      guestAccessLinkId: string;
    },
  ): Promise<
    | LinkManagementFailure
    | ExpirationFailure
    | { kind: "success"; link: GuestAccessLinkRecord }
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

      const updatedAt = now();
      const expiresAt =
        input.expiresAt === undefined
          ? undefined
          : resolveGuestAccessExpiration(input.expiresAt, updatedAt);
      if (input.expiresAt !== undefined && !expiresAt) {
        return { kind: "invalid_expiration" };
      }
      const [link] = await tx
        .update(householdGuestAccessLinks)
        .set({
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.access === undefined ? {} : { access: input.access }),
          ...(expiresAt === undefined ? {} : { expiresAt }),
          ...(input.enabled === undefined
            ? {}
            : { disabledAt: input.enabled ? null : updatedAt }),
          updatedAt,
        })
        .where(eq(householdGuestAccessLinks.id, existing.id))
        .returning(linkSelection);
      if (!link) throw new Error("Guest access link update returned no row");

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

      return { kind: "success", link, token };
    });
  };
}
