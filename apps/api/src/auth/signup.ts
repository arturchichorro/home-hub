import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { Database } from "@home-hub/database";
import { refreshTokens, users } from "@home-hub/database/schema";
import type { SignupRequest } from "@home-hub/shared/auth";
import { signAccessToken } from "./access-token";
import { hashPassword } from "./password";
import { generateRefreshToken, hashRefreshToken } from "./refresh-token";

const refreshTokenTtlMilliseconds = 30 * 24 * 60 * 60 * 1000;

type CreateSignupServiceInput = {
  db: Database;
  jwtSecret: string;
  signupAccessCode: string | undefined;
};

export type SignupResult =
  | { kind: "forbidden" }
  | { kind: "conflict" }
  | {
      kind: "success";
      user: {
        id: string;
        username: string;
        email: string;
      };
      accessToken: string;
      refreshToken: string;
    };

function hashAccessCode(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function isSignupAccessCodeValid(input: {
  configuredAccessCode: string | undefined;
  submittedAccessCode: string;
}): boolean {
  if (!input.configuredAccessCode) {
    return false;
  }

  return timingSafeEqual(
    hashAccessCode(input.configuredAccessCode),
    hashAccessCode(input.submittedAccessCode),
  );
}

export function createSignupService(input: CreateSignupServiceInput) {
  return async function signup(request: SignupRequest): Promise<SignupResult> {
    if (
      !isSignupAccessCodeValid({
        configuredAccessCode: input.signupAccessCode,
        submittedAccessCode: request.accessCode,
      })
    ) {
      return { kind: "forbidden" };
    }

    const now = new Date();
    const userId = randomUUID();
    const refreshTokenId = randomUUID();
    const refreshToken = generateRefreshToken();
    const passwordHash = await hashPassword(request.password);
    const accessToken = signAccessToken({
      userId,
      jwtId: randomUUID(),
      secret: input.jwtSecret,
      now,
    });
    const expiresAt = new Date(now.getTime() + refreshTokenTtlMilliseconds);

    const user = await input.db.transaction(async (tx) => {
      const [createdUser] = await tx
        .insert(users)
        .values({
          id: userId,
          username: request.username,
          email: request.email,
          passwordHash,
        })
        .onConflictDoNothing()
        .returning({
          id: users.id,
          username: users.username,
          email: users.email,
        });

      if (!createdUser) {
        return undefined;
      }

      await tx.insert(refreshTokens).values({
        id: refreshTokenId,
        userId: createdUser.id,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt,
      });

      return createdUser;
    });

    if (!user) {
      return { kind: "conflict" };
    }

    return {
      kind: "success",
      user,
      accessToken,
      refreshToken,
    };
  };
}
