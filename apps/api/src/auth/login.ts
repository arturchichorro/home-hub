import { randomUUID } from "node:crypto";
import type { createDbClient } from "@home-hub/database/client";
import { refreshTokens } from "@home-hub/database/schema";
import type { LoginRequest } from "@home-hub/shared/auth";
import { signAccessToken } from "./access-token";
import { hashPassword, verifyPassword } from "./password";
import { generateRefreshToken, hashRefreshToken } from "./refresh-token";

const refreshTokenTtlMilliseconds = 30 * 24 * 60 * 60 * 1000;

type Database = ReturnType<typeof createDbClient>["db"];

type CreateLoginServiceInput = {
  db: Database;
  jwtSecret: string;
};

export type LoginResult =
  | { kind: "invalid_credentials" }
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

export function createLoginService(input: CreateLoginServiceInput) {
  const dummyPasswordHashPromise = hashPassword("not-a-real-user-password");

  return async function login(request: LoginRequest): Promise<LoginResult> {
    const user = await input.db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, request.email),
    });

    const passwordHash = user?.passwordHash ?? (await dummyPasswordHashPromise);

    const passwordIsValid = await verifyPassword({
      password: request.password,
      passwordHash,
    });

    if (!user || !passwordIsValid) return { kind: "invalid_credentials" };

    const now = new Date();
    const refreshTokenId = randomUUID();
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(now.getTime() + refreshTokenTtlMilliseconds);

    const accessToken = signAccessToken({
      userId: user.id,
      jwtId: randomUUID(),
      secret: input.jwtSecret,
      now,
    });

    await input.db.insert(refreshTokens).values({
      id: refreshTokenId,
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt,
    });

    return {
      kind: "success",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
      accessToken,
      refreshToken,
    };
  };
}
