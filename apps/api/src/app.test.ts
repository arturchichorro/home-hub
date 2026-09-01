import { describe, expect, it, vi } from "vitest";

import { type CreateAppInput, createApp } from "./app";
import { signAccessToken } from "./auth/access-token";
import type { StructuredLogger, StructuredLogRecord } from "./observability";
import type { ZeroDbProvider } from "./zero/db-provider";

const dbProvider = {} as ZeroDbProvider;
const jwtSecret = "test-jwt-secret";
const silentLogger: StructuredLogger = {
  info() {},
  error() {},
};

const defaultInput: CreateAppInput = {
  auth: {
    signup: async () => ({ kind: "forbidden" }),
    login: async () => ({ kind: "invalid_credentials" }),
    refresh: async () => ({ kind: "invalid_token" }),
    logout: async () => undefined,
    getMe: async () => ({ kind: "not_found" }),
  },
  households: {
    acceptHouseholdInvite: async () => ({ kind: "invalid_invite" }),
    createHousehold: async () => ({ kind: "unauthorized" }),
    createHouseholdInvite: async () => ({ kind: "forbidden" }),
    deleteHousehold: async () => ({ kind: "forbidden" }),
    listHouseholds: async () => ({ kind: "unauthorized" }),
    listHouseholdInvites: async () => ({ kind: "forbidden" }),
    listHouseholdMembers: async () => ({ kind: "forbidden" }),
    leaveHousehold: async () => ({ kind: "forbidden" }),
    transferHouseholdOwnership: async () => ({ kind: "forbidden" }),
    setHouseholdModuleEnabled: async () => ({ kind: "forbidden" }),
    renameHousehold: async () => ({ kind: "forbidden" }),
    revokeHouseholdInvite: async () => ({ kind: "forbidden" }),
    removeHouseholdMember: async () => ({ kind: "forbidden" }),
  },
  recipeImages: {
    confirmRecipeImageUpload: async () => ({ kind: "forbidden" }),
    createRecipeImageReadUrl: async () => ({ kind: "forbidden" }),
    createRecipeImageReadUrls: async () => ({ kind: "forbidden" }),
    createRecipeImageUpload: async () => ({ kind: "forbidden" }),
    deleteRecipeImage: async () => ({ kind: "forbidden" }),
  },
  infrastructure: {
    zeroDbProvider: dbProvider,
    jwtSecret,
    isProduction: false,
    logger: silentLogger,
    readinessCheck: async () => undefined,
  },
};

type CreateTestAppOverrides = {
  [Group in keyof CreateAppInput]?: Partial<CreateAppInput[Group]>;
};

function createTestApp(overrides: CreateTestAppOverrides = {}) {
  return createApp({
    auth: { ...defaultInput.auth, ...overrides.auth },
    households: { ...defaultInput.households, ...overrides.households },
    recipeImages: { ...defaultInput.recipeImages, ...overrides.recipeImages },
    infrastructure: {
      ...defaultInput.infrastructure,
      ...overrides.infrastructure,
    },
  });
}

function createMemoryLogger() {
  const infoRecords: StructuredLogRecord[] = [];
  const errorRecords: StructuredLogRecord[] = [];

  return {
    logger: {
      info: (record) => infoRecords.push(record),
      error: (record) => errorRecords.push(record),
    } satisfies StructuredLogger,
    infoRecords,
    errorRecords,
  };
}

describe("app", () => {
  it("returns a successful health response", async () => {
    const app = createTestApp();

    const response = await app.request("/api/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("reports readiness when required infrastructure responds", async () => {
    const readinessCheck = vi.fn(async () => undefined);
    const app = createTestApp({ infrastructure: { readinessCheck } });

    const response = await app.request("/api/ready");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(readinessCheck).toHaveBeenCalledOnce();
  });

  it("reports unready without exposing infrastructure errors", async () => {
    const readinessCheck = vi.fn(async () => {
      throw new Error("postgres://user:secret@database/home_hub");
    });
    const app = createTestApp({ infrastructure: { readinessCheck } });

    const response = await app.request("/api/ready");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ ok: false });
    expect(readinessCheck).toHaveBeenCalledOnce();
  });

  it("logs completed requests with a returned request ID", async () => {
    const { logger, infoRecords, errorRecords } = createMemoryLogger();
    const app = createTestApp({ infrastructure: { logger } });

    const response = await app.request("/api/health", {
      headers: { "X-Request-Id": "browser-request-123" },
    });

    expect(response.headers.get("x-request-id")).toBe("browser-request-123");
    expect(errorRecords).toEqual([]);
    expect(infoRecords).toHaveLength(1);
    expect(infoRecords[0]).toEqual({
      event: "http_request",
      requestId: "browser-request-123",
      method: "GET",
      route: "/api/health",
      status: 200,
      durationMs: expect.any(Number),
    });
  });

  it("logs expected authorization failures without error details", async () => {
    const { logger, infoRecords, errorRecords } = createMemoryLogger();
    const app = createTestApp({ infrastructure: { logger } });

    const response = await app.request("/api/households", {
      headers: { "X-Request-Id": "unauthorized-request-123" },
    });

    expect(response.status).toBe(401);
    expect(errorRecords).toEqual([]);
    expect(infoRecords).toHaveLength(1);
    expect(infoRecords[0]).toEqual(
      expect.objectContaining({
        event: "http_request",
        requestId: "unauthorized-request-123",
        method: "GET",
        status: 401,
      }),
    );
    expect(infoRecords[0]).not.toHaveProperty("error");
  });

  it("logs unexpected errors once without exposing secret-bearing messages", async () => {
    const secret =
      "password=hunter2 token=secret-token signedUrl=https://example.test/?signature=secret";
    const { logger, infoRecords, errorRecords } = createMemoryLogger();
    const createHousehold = async () => {
      const error = new Error(secret);
      error.name = secret;
      throw error;
    };
    const app = createTestApp({
      households: { createHousehold },
      infrastructure: { logger },
    });
    const accessToken = signAccessToken({
      userId: "9f8a6942-f721-499d-957d-7bb3ed1158db",
      jwtId: "49ef297e-ed36-44b0-913f-0ef66e81887d",
      secret: jwtSecret,
    });

    const response = await app.request("/api/households", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Request-Id": "failed-request-123",
      },
      body: JSON.stringify({ name: "Home" }),
    });
    const responseBody = await response.json();

    expect(response.status).toBe(500);
    expect(responseBody).toEqual({
      error: "Internal server error",
      requestId: "failed-request-123",
    });
    expect(infoRecords).toEqual([]);
    expect(errorRecords).toHaveLength(1);
    expect(errorRecords[0]).toEqual(
      expect.objectContaining({
        event: "http_request",
        requestId: "failed-request-123",
        method: "POST",
        status: 500,
        durationMs: expect.any(Number),
        error: expect.objectContaining({ name: "Error" }),
      }),
    );
    expect(JSON.stringify(errorRecords)).not.toContain(secret);
    expect(JSON.stringify(responseBody)).not.toContain(secret);
  });

  it("mounts household creation at POST /api/households", async () => {
    const household = {
      id: "d92e5c4e-1c68-4942-9cc9-710207661bca",
      name: "Home",
    };
    const createHousehold = vi.fn(async () => ({
      kind: "success" as const,
      household,
    }));
    const app = createTestApp({
      households: { createHousehold },
    });
    const accessToken = signAccessToken({
      userId: "9f8a6942-f721-499d-957d-7bb3ed1158db",
      jwtId: "49ef297e-ed36-44b0-913f-0ef66e81887d",
      secret: jwtSecret,
    });

    const response = await app.request("/api/households", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Home" }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ household });
    expect(createHousehold).toHaveBeenCalledOnce();
  });

  it("does not mount retired Shopping endpoints", async () => {
    const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
    const app = createTestApp();
    const accessToken = signAccessToken({
      userId: "9f8a6942-f721-499d-957d-7bb3ed1158db",
      jwtId: "49ef297e-ed36-44b0-913f-0ef66e81887d",
      secret: jwtSecret,
    });

    const response = await app.request(
      `/api/households/${householdId}/shopping/items`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Milk" }),
      },
    );

    expect(response.status).toBe(404);
  });
});
