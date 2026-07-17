import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { signAccessToken, verifyAccessToken } from "./access-token";

const secret = "super-secret";
const now = new Date("2026-01-01T00:00:00Z");
const issuedAt = Math.floor(now.getTime() / 1000);

function base64UrlEncodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signJwtParts(input: {
  header: unknown;
  payload: unknown;
  secret: string;
}): string {
  const encodedHeader = base64UrlEncodeJson(input.header);
  const encodedPayload = base64UrlEncodeJson(input.payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", input.secret)
    .update(signingInput)
    .digest("base64url");

  return `${signingInput}.${signature}`;
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    sub: "user-123",
    iss: "home-hub-api",
    aud: "home-hub-api",
    iat: issuedAt,
    exp: issuedAt + 600,
    jti: "jwt-123",
    ...overrides,
  };
}

describe("signAccessToken", () => {
  it("creates a JWT with three parts", () => {
    const token = signAccessToken({
      userId: "user-123",
      jwtId: "jwt-123",
      secret,
      now,
    });

    expect(token.split(".")).toHaveLength(3);
  });

  it("uses the default TTL of 10 minutes", () => {
    const token = signAccessToken({
      userId: "user-123",
      jwtId: "jwt-123",
      secret,
      now,
    });

    const claims = verifyAccessToken({
      token,
      secret,
      now,
    });

    expect(claims.iat).toBe(issuedAt);
    expect(claims.exp).toBe(issuedAt + 600);
  });

  it("uses a custom TTL", () => {
    const token = signAccessToken({
      userId: "user-123",
      jwtId: "jwt-123",
      secret,
      now,
      ttlSeconds: 120,
    });

    const claims = verifyAccessToken({
      token,
      secret,
      now,
    });

    expect(claims.exp - claims.iat).toBe(120);
  });
});

describe("verifyAccessToken", () => {
  it("returns the original claims", () => {
    const token = signAccessToken({
      userId: "user-123",
      jwtId: "jwt-123",
      secret,
      now,
    });

    expect(
      verifyAccessToken({
        token,
        secret,
        now,
      }),
    ).toEqual({
      sub: "user-123",
      iss: "home-hub-api",
      aud: "home-hub-api",
      iat: issuedAt,
      exp: issuedAt + 600,
      jti: "jwt-123",
    });
  });

  it("throws if the signature is invalid", () => {
    const token = signAccessToken({
      userId: "user-123",
      jwtId: "jwt-123",
      secret,
      now,
    });

    expect(() =>
      verifyAccessToken({
        token,
        secret: "wrong-secret",
        now,
      }),
    ).toThrow();
  });

  it("throws if the token has been tampered with", () => {
    const token = signAccessToken({
      userId: "user-123",
      jwtId: "jwt-123",
      secret,
      now,
    });

    const [header, _payload, signature] = token.split(".");
    const tamperedToken = [
      header,
      base64UrlEncodeJson(validPayload({ sub: "attacker" })),
      signature,
    ].join(".");

    expect(() =>
      verifyAccessToken({
        token: tamperedToken,
        secret,
        now,
      }),
    ).toThrow();
  });

  it("throws if the algorithm is not HS256", () => {
    const token = signJwtParts({
      header: { typ: "JWT", alg: "none" },
      payload: validPayload(),
      secret,
    });

    expect(() => verifyAccessToken({ token, secret, now })).toThrow();
  });

  it("throws if the issuer is wrong", () => {
    const token = signJwtParts({
      header: { typ: "JWT", alg: "HS256" },
      payload: validPayload({ iss: "evil-api" }),
      secret,
    });

    expect(() => verifyAccessToken({ token, secret, now })).toThrow();
  });

  it("throws if the audience is wrong", () => {
    const token = signJwtParts({
      header: { typ: "JWT", alg: "HS256" },
      payload: validPayload({ aud: "evil-client" }),
      secret,
    });

    expect(() => verifyAccessToken({ token, secret, now })).toThrow();
  });

  it("throws if required claims are missing", () => {
    const token = signJwtParts({
      header: { typ: "JWT", alg: "HS256" },
      payload: validPayload({ sub: undefined }),
      secret,
    });

    expect(() => verifyAccessToken({ token, secret, now })).toThrow();
  });

  it("throws if the token is expired", () => {
    const token = signAccessToken({
      userId: "user-123",
      jwtId: "jwt-123",
      secret,
      now,
      ttlSeconds: 60,
    });

    expect(() =>
      verifyAccessToken({
        token,
        secret,
        now: new Date("2026-01-01T00:02:00Z"),
      }),
    ).toThrow();
  });

  it("throws if the token was issued in the future", () => {
    const token = signJwtParts({
      header: { typ: "JWT", alg: "HS256" },
      payload: validPayload({ iat: issuedAt + 1 }),
      secret,
    });

    expect(() => verifyAccessToken({ token, secret, now })).toThrow();
  });

  it("throws for an invalid token format", () => {
    expect(() =>
      verifyAccessToken({
        token: "not-a-jwt",
        secret,
      }),
    ).toThrow();
  });
});
