import type { Database } from "@home-hub/database";
import { refreshTokens } from "@home-hub/database/schema";
import { eq } from "drizzle-orm";

import { hashRefreshToken } from "./refresh-token";

type CreateLogoutServiceInput = {
  db: Database;
};

export function createLogoutService(input: CreateLogoutServiceInput) {
  return async function logout(rawRefreshToken: string): Promise<void> {
    await input.db.transaction(async (tx) => {
      const [storedToken] = await tx
        .select({
          id: refreshTokens.id,
          expiresAt: refreshTokens.expiresAt,
          revokedAt: refreshTokens.revokedAt,
          replacedById: refreshTokens.replacedById,
        })
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, hashRefreshToken(rawRefreshToken)))
        .limit(1)
        .for("update");

      if (!storedToken) {
        return;
      }

      const now = new Date();

      if (storedToken.expiresAt.getTime() <= now.getTime()) {
        return;
      }

      if (!storedToken.revokedAt) {
        await tx
          .update(refreshTokens)
          .set({
            revokedAt: now,
            updatedAt: now,
          })
          .where(eq(refreshTokens.id, storedToken.id));

        return;
      }

      let replacementId: string | null = storedToken.replacedById;

      while (replacementId) {
        const [descendant] = await tx
          .select({
            id: refreshTokens.id,
            revokedAt: refreshTokens.revokedAt,
            replacedById: refreshTokens.replacedById,
          })
          .from(refreshTokens)
          .where(eq(refreshTokens.id, replacementId))
          .limit(1)
          .for("update");

        if (!descendant) {
          throw new Error("Broken refresh-token chain");
        }

        if (!descendant.revokedAt) {
          await tx
            .update(refreshTokens)
            .set({
              revokedAt: now,
              updatedAt: now,
            })
            .where(eq(refreshTokens.id, descendant.id));
        }

        replacementId = descendant.replacedById;
      }
    });
  };
}
