import { describe, expect, it } from "vitest";

import { signAccessToken } from "../../auth/access-token";
import { createZeroRoutes } from "./index";

const jwtSecret = "test-jwt-secret";
const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";

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

describe("Zero query routes", () => {
  it("rejects an unauthenticated request", async () => {
    const app = createZeroRoutes({ jwtSecret });

    const response = await postQuery({
      app,
      body: createQueryRequest(),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns an authorized query transformation", async () => {
    const app = createZeroRoutes({ jwtSecret });

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
    const app = createZeroRoutes({ jwtSecret });

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
    const app = createZeroRoutes({ jwtSecret });

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
});
