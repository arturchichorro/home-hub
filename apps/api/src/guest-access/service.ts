import { randomUUID } from "node:crypto";
import type { Database, DatabaseTransaction } from "@home-hub/database";
import {
  households,
  householdGuestAccessLinks as links,
} from "@home-hub/database/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { findActiveUser } from "../authorization/active-user";
import { findHouseholdOwnerForShare } from "../authorization/household-access";
import { generateGuestCredential, hashGuestCredential } from "./credential";

type OwnerInput = { userId: string; householdId: string };
export type CreateGuestLinkInput = OwnerInput & {
  name: string;
  access: "read" | "write";
  expiresAt?: Date | undefined;
};
const publicColumns = {
  id: links.id,
  householdId: links.householdId,
  name: links.name,
  access: links.access,
  expiresAt: links.expiresAt,
  disabledAt: links.disabledAt,
  createdAt: links.createdAt,
};

async function authorizeOwner(tx: DatabaseTransaction, input: OwnerInput) {
  if (!(await findActiveUser(tx, input.userId))) return "unauthorized" as const;
  const [household] = await tx
    .select({ id: households.id })
    .from(households)
    .where(
      and(eq(households.id, input.householdId), isNull(households.deletedAt)),
    )
    .limit(1)
    .for("share");
  if (!household || !(await findHouseholdOwnerForShare(tx, input)))
    return "forbidden" as const;
  return undefined;
}

export function createGuestLinkService({ db }: { db: Database }) {
  return {
    create: (input: CreateGuestLinkInput) =>
      db.transaction(async (tx) => {
        const denied = await authorizeOwner(tx, input);
        if (denied) return { kind: denied };
        const now = new Date();
        const expiresAt =
          input.expiresAt ?? new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        const name = input.name.trim();
        if (
          !name ||
          name.length > 100 ||
          !["read", "write"].includes(input.access) ||
          !Number.isFinite(expiresAt.getTime()) ||
          expiresAt <= now
        )
          return { kind: "invalid" as const };
        const credential = generateGuestCredential();
        const [link] = await tx
          .insert(links)
          .values({
            id: randomUUID(),
            householdId: input.householdId,
            name,
            access: input.access,
            expiresAt,
            createdAt: now,
            createdByUserId: input.userId,
            tokenHash: hashGuestCredential(credential),
          })
          .returning(publicColumns);
        return { kind: "success" as const, link, credential };
      }),
    list: (input: OwnerInput) =>
      db.transaction(async (tx) => {
        const denied = await authorizeOwner(tx, input);
        if (denied) return { kind: denied };
        const rows = await tx
          .select(publicColumns)
          .from(links)
          .where(eq(links.householdId, input.householdId))
          .orderBy(desc(links.createdAt), links.id);
        return { kind: "success" as const, links: rows };
      }),
    disable: (input: OwnerInput & { linkId: string }) =>
      db.transaction(async (tx) => {
        const denied = await authorizeOwner(tx, input);
        if (denied) return { kind: denied };
        const [link] = await tx
          .select({ id: links.id, disabledAt: links.disabledAt })
          .from(links)
          .where(
            and(
              eq(links.id, input.linkId),
              eq(links.householdId, input.householdId),
            ),
          )
          .limit(1)
          .for("update");
        if (!link) return { kind: "not_found" as const };
        if (!link.disabledAt)
          await tx
            .update(links)
            .set({ disabledAt: new Date() })
            .where(eq(links.id, link.id));
        return { kind: "success" as const };
      }),
  };
}
export type GuestLinkService = ReturnType<typeof createGuestLinkService>;
