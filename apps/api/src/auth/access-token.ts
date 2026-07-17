import { createHmac, timingSafeEqual } from "node:crypto";

const accessTokenIssuer = "home-hub-api";
const accessTokenAudience = "home-hub-api";
const accessTokenAlgorithm = "HS256";
const accessTokenType = "JWT";
const defaultAccessTokenTtlSeconds = 10 * 60;

export type AccessTokenClaims = {
  sub: string;
  iss: typeof accessTokenIssuer;
  aud: typeof accessTokenAudience;
  iat: number;
  exp: number;
  jti: string;
};

type AccessTokenHeader = {
  typ: typeof accessTokenType;
  alg: typeof accessTokenAlgorithm;
};

function secondsSinceEpoch(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function base64UrlEncodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function base64UrlDecodeJson(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid access token");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sign(input: { signingInput: string; secret: string }): string {
  return createHmac("sha256", input.secret)
    .update(input.signingInput)
    .digest("base64url");
}

function assertValidHeader(value: unknown): asserts value is AccessTokenHeader {
  if (!isRecord(value)) {
    throw new Error("Invalid access token");
  }

  if (value.typ !== accessTokenType || value.alg !== accessTokenAlgorithm) {
    throw new Error("Invalid access token");
  }
}

function assertValidClaims(value: unknown): asserts value is AccessTokenClaims {
  if (!isRecord(value)) {
    throw new Error("Invalid access token");
  }

  if (
    typeof value.sub !== "string" ||
    typeof value.jti !== "string" ||
    value.iss !== accessTokenIssuer ||
    value.aud !== accessTokenAudience ||
    !Number.isInteger(value.iat) ||
    !Number.isInteger(value.exp)
  ) {
    throw new Error("Invalid access token");
  }
}

function assertValidSignature(input: {
  signingInput: string;
  signature: string;
  secret: string;
}): void {
  const expectedSignature = Buffer.from(
    sign({ signingInput: input.signingInput, secret: input.secret }),
    "base64url",
  );
  const receivedSignature = Buffer.from(input.signature, "base64url");

  if (receivedSignature.length !== expectedSignature.length) {
    throw new Error("Invalid access token");
  }

  if (!timingSafeEqual(receivedSignature, expectedSignature)) {
    throw new Error("Invalid access token");
  }
}

export function signAccessToken(input: {
  userId: string;
  jwtId: string;
  secret: string;
  now?: Date;
  ttlSeconds?: number;
}): string {
  const now = input.now ?? new Date();
  const issuedAt = secondsSinceEpoch(now);
  const ttlSeconds = input.ttlSeconds ?? defaultAccessTokenTtlSeconds;
  const header: AccessTokenHeader = {
    typ: accessTokenType,
    alg: accessTokenAlgorithm,
  };
  const claims: AccessTokenClaims = {
    sub: input.userId,
    iss: accessTokenIssuer,
    aud: accessTokenAudience,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
    jti: input.jwtId,
  };
  const encodedHeader = base64UrlEncodeJson(header);
  const encodedPayload = base64UrlEncodeJson(claims);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = sign({ signingInput, secret: input.secret });

  return `${signingInput}.${signature}`;
}

export function verifyAccessToken(input: {
  token: string;
  secret: string;
  now?: Date;
}): AccessTokenClaims {
  const parts = input.token.split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid access token");
  }

  const [encodedHeader, encodedPayload, signature] = parts;

  if (!encodedHeader || !encodedPayload || !signature) {
    throw new Error("Invalid access token");
  }

  const header = base64UrlDecodeJson(encodedHeader);
  assertValidHeader(header);

  assertValidSignature({
    signingInput: `${encodedHeader}.${encodedPayload}`,
    signature,
    secret: input.secret,
  });

  const claims = base64UrlDecodeJson(encodedPayload);
  assertValidClaims(claims);

  const now = secondsSinceEpoch(input.now ?? new Date());

  if (claims.iat > now || claims.exp <= now) {
    throw new Error("Invalid access token");
  }

  return claims;
}
