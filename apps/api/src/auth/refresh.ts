import { randomUUID } from "node:crypto";
import type { createDbClient } from "@home-hub/database/client";
import { refreshTokens } from "@home-hub/database/schema";
import { eq } from "drizzle-orm";
import { signAccessToken } from "./access-token";
import { generateRefreshToken, hashRefreshToken } from "./refresh-token";

export type RefreshResult =
  | { kind: "invalid_token" }
  | { kind: "success"; accessToken: string; refreshToken: string };

type Database = ReturnType<typeof createDbClient>["db"];

type CreateRefreshServiceInput = {
  db: Database;
  jwtSecret: string;
};

export function createRefreshService(input: CreateRefreshServiceInput) {
  return async function refresh(
    rawRefreshToken: string,
  ): Promise<RefreshResult> {
    return input.db.transaction(async (tx) => {
      const [storedToken] = await tx
        .select({
          id: refreshTokens.id,
          userId: refreshTokens.userId,
          expiresAt: refreshTokens.expiresAt,
          revokedAt: refreshTokens.revokedAt,
          replacedById: refreshTokens.replacedById,
        })
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, hashRefreshToken(rawRefreshToken)))
        .limit(1)
        .for("update");

      if (!storedToken) return { kind: "invalid_token" };

      const now = new Date();

      if (storedToken.expiresAt.getTime() <= now.getTime())
        return { kind: "invalid_token" };

      if (storedToken.revokedAt) {
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

        return { kind: "invalid_token" };
      }

      const replacementId = randomUUID();
      const replacementRefreshToken = generateRefreshToken();

      await tx.insert(refreshTokens).values({
        id: replacementId,
        userId: storedToken.userId,
        tokenHash: hashRefreshToken(replacementRefreshToken),
        expiresAt: storedToken.expiresAt,
      });

      await tx
        .update(refreshTokens)
        .set({
          revokedAt: now,
          replacedById: replacementId,
          updatedAt: now,
        })
        .where(eq(refreshTokens.id, storedToken.id));

      const accessToken = signAccessToken({
        userId: storedToken.userId,
        jwtId: randomUUID(),
        secret: input.jwtSecret,
        now,
      });

      return {
        kind: "success",
        accessToken,
        refreshToken: replacementRefreshToken,
      };
    });
  };
}
