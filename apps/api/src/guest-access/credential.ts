import { createHash, randomBytes } from "node:crypto";
import type { Database } from "@home-hub/database";
import {
  households,
  householdGuestAccessLinks as links,
} from "@home-hub/database/schema";
import { and, eq, gt, isNull } from "drizzle-orm";

export function generateGuestCredential() {
  return `hhg_v1_${randomBytes(32).toString("base64url")}`;
}

export function hashGuestCredential(credential: string) {
  return createHash("sha256").update(credential).digest("hex");
}

export function isGuestCredential(credential: string) {
  return /^hhg_v1_[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(credential);
}

export function createValidateGuestCredential({ db }: { db: Database }) {
  return async (credential: string) => {
    if (!isGuestCredential(credential)) return undefined;
    const [link] = await db
      .select({
        id: links.id,
        householdId: links.householdId,
        access: links.access,
        expiresAt: links.expiresAt,
      })
      .from(links)
      .innerJoin(households, eq(households.id, links.householdId))
      .where(
        and(
          eq(links.tokenHash, hashGuestCredential(credential)),
          isNull(links.disabledAt),
          gt(links.expiresAt, new Date()),
          isNull(households.deletedAt),
        ),
      )
      .limit(1);
    return link;
  };
}
