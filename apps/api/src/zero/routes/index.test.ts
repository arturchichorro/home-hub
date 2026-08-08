import type { TransactionProviderHooks } from "@rocicorp/zero/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { signAccessToken } from "../../auth/access-token";
import type { ZeroDbProvider } from "../db-provider";
import { createZeroRoutes } from "./index";

const jwtSecret = "test-jwt-secret";
const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const itemId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";
const dbProvider = {} as ZeroDbProvider;

afterEach(() => {
  vi.restoreAllMocks();
});

function createMutationTestProvider({
  membershipExists = true,
  moduleEnabled = true,
}: {
  membershipExists?: boolean;
  moduleEnabled?: boolean;
} = {}) {
  const results: unknown[] = !membershipExists
    ? [undefined]
    : moduleEnabled
      ? [
          { id: "membership-id" },
          { householdId, moduleKey: "shopping", enabled: true },
          { id: itemId, householdId },
        ]
      : [{ id: "membership-id" }, undefined];
  const run = vi.fn(async () => results.shift());
  const update = vi.fn(async () => undefined);
  const serverTransaction = {
    clientID: "test-client",
    location: "server",
    mutate: {
      shoppingItems: { update },
    },
    mutationID: 1,
    reason: "authoritative",
    run,
  };
  const hooks: TransactionProviderHooks = {
    updateClientMutationID: vi.fn(async () => ({ lastMutationID: 1 })),
    writeMutationResult: vi.fn(async () => undefined),
    deleteMutationResults: vi.fn(async () => undefined),
  };
  const transaction = vi.fn(
    async (
      callback: (
        tx: typeof serverTransaction,
        transactionHooks: TransactionProviderHooks,
      ) => unknown | Promise<unknown>,
    ) => callback(serverTransaction, hooks),
  );

  return {
    dbProvider: { transaction } as unknown as ZeroDbProvider,
    transaction,
    update,
  };
}

function createAccessToken() {
  return signAccessToken({
    userId,
    jwtId: "49ef297e-ed36-44b0-913f-0ef66e81887d",
    secret: jwtSecret,
  });
}

type ZeroQueryResponse = {
  queries: Array<{ ast?: unknown }>;
};

function createQueryRequest(input?: { name?: string; householdId?: string }) {
  return [
    "transform",
    [
      {
        id: "query-1",
        name: input?.name ?? "shopping.byHousehold",
        args: [{ householdId: input?.householdId ?? householdId }],
      },
    ],
  ];
}

function createMutationRequest(input?: {
  householdId?: string;
  itemId?: string;
}) {
  return {
    clientGroupID: "test-client-group",
    mutations: [
      {
        type: "custom",
        id: 1,
        clientID: "test-client",
        name: "shopping.setStatus",
        args: [
          {
            householdId: input?.householdId ?? householdId,
            itemId: input?.itemId ?? itemId,
            status: "crossed",
            optimisticUpdatedAt: 1_786_000_000_000,
          },
        ],
        timestamp: 1_786_000_000_000,
      },
    ],
    pushVersion: 1,
    timestamp: 1_786_000_000_000,
    requestID: "test-request",
  };
}

function postQuery(input: {
  app: ReturnType<typeof createZeroRoutes>;
  body: unknown;
  accessToken?: string;
}) {
  return input.app.request("/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(input.accessToken
        ? { Authorization: `Bearer ${input.accessToken}` }
        : {}),
    },
    body: JSON.stringify(input.body),
  });
}

describe("Zero routes", () => {
  it("rejects an unauthenticated request", async () => {
    const app = createZeroRoutes({ dbProvider, jwtSecret });

    const response = await postQuery({
      app,
      body: createQueryRequest(),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns an authorized query transformation", async () => {
    const app = createZeroRoutes({ dbProvider, jwtSecret });

    const response = await postQuery({
      app,
      body: createQueryRequest(),
      accessToken: createAccessToken(),
    });
    const body = (await response.json()) as ZeroQueryResponse;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      kind: "QueryResponse",
      userID: userId,
      queries: [
        {
          id: "query-1",
          name: "shopping.byHousehold",
        },
      ],
    });

    const transformedQuery = body.queries[0];
    expect(transformedQuery).toBeDefined();
    if (!transformedQuery) {
      throw new Error("Expected a transformed query");
    }

    const serializedAst = JSON.stringify(transformedQuery.ast);
    expect(serializedAst).toContain(householdId);
    expect(serializedAst).toContain(userId);
  });

  it("returns an application error for an invalid household ID", async () => {
    const app = createZeroRoutes({ dbProvider, jwtSecret });

    const response = await postQuery({
      app,
      body: createQueryRequest({ householdId: "not-a-uuid" }),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: "QueryResponse",
      userID: userId,
      queries: [
        {
          error: "app",
          id: "query-1",
          message: expect.stringContaining("Invalid UUID"),
          name: "shopping.byHousehold",
        },
      ],
    });
  });

  it("returns an application error for an unknown query", async () => {
    const app = createZeroRoutes({ dbProvider, jwtSecret });

    const response = await postQuery({
      app,
      body: createQueryRequest({ name: "shopping.unknown" }),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: "QueryResponse",
      userID: userId,
      queries: [
        {
          error: "app",
          id: "query-1",
          message: "Query not found: shopping.unknown",
          name: "shopping.unknown",
        },
      ],
    });
  });

  it("rejects an unauthenticated mutation request before using the database provider", async () => {
    const app = createZeroRoutes({ dbProvider, jwtSecret });

    const response = await app.request("/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("executes an authenticated custom mutation and returns a Zero response", async () => {
    const authoritativeUpdatedAt = 1_786_000_001_000;
    vi.spyOn(Date, "now").mockReturnValue(authoritativeUpdatedAt);
    const { dbProvider, transaction, update } = createMutationTestProvider();
    const app = createZeroRoutes({ dbProvider, jwtSecret });

    const response = await app.request("/mutate?schema=zero_0&appID=home-hub", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${createAccessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createMutationRequest()),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      kind: "MutateResponse",
      userID: userId,
      mutations: [
        {
          id: { clientID: "test-client", id: 1 },
          result: {},
        },
      ],
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith({
      id: itemId,
      status: "crossed",
      updatedAt: authoritativeUpdatedAt,
    });
  });

  it("rejects a forged household ID without updating the item", async () => {
    const forgedHouseholdId = "4972e6d6-802f-4c62-a904-91fb9025dba7";
    const { dbProvider, update } = createMutationTestProvider({
      membershipExists: false,
    });
    const app = createZeroRoutes({ dbProvider, jwtSecret });

    const response = await app.request("/mutate?schema=zero_0&appID=home-hub", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${createAccessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        createMutationRequest({ householdId: forgedHouseholdId }),
      ),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      kind: "MutateResponse",
      userID: userId,
      mutations: [
        {
          id: { clientID: "test-client", id: 1 },
          result: {
            error: "app",
            message: "Household module mutation not allowed",
          },
        },
      ],
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a mutation when the shopping module is disabled", async () => {
    const { dbProvider, update } = createMutationTestProvider({
      moduleEnabled: false,
    });
    const app = createZeroRoutes({ dbProvider, jwtSecret });

    const response = await app.request("/mutate?schema=zero_0&appID=home-hub", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${createAccessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createMutationRequest()),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      mutations: [
        {
          result: {
            error: "app",
            message: "Household module mutation not allowed",
          },
        },
      ],
    });
    expect(update).not.toHaveBeenCalled();
  });
});
