import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { signAccessToken } from "../../auth/access-token";
import type {
  SetShoppingItemStatusInput,
  SetShoppingItemStatusResult,
} from "../set-status";
import { createShoppingRoutes } from "./index";

const jwtSecret = "test-jwt-secret";
const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";
const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const itemId = "8d46a4c4-4845-4a6d-a937-139633ae1bb9";

function createAccessToken() {
  return signAccessToken({
    userId,
    jwtId: "49ef297e-ed36-44b0-913f-0ef66e81887d",
    secret: jwtSecret,
  });
}

function createTestRoutes(
  setShoppingItemStatus: (
    input: SetShoppingItemStatusInput,
  ) => Promise<SetShoppingItemStatusResult> = async () => ({
    kind: "forbidden",
  }),
) {
  const app = new Hono();

  app.route(
    "/:householdId/shopping",
    createShoppingRoutes({
      addShoppingItem: async () => ({ kind: "forbidden" }),
      setShoppingItemStatus,
      jwtSecret,
    }),
  );

  return app;
}

function patchShoppingItemStatus(input: {
  app: ReturnType<typeof createTestRoutes>;
  householdId: string;
  itemId: string;
  body: string;
  accessToken?: string;
}) {
  return input.app.request(
    `/${input.householdId}/shopping/items/${input.itemId}/status`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(input.accessToken
          ? { Authorization: `Bearer ${input.accessToken}` }
          : {}),
      },
      body: input.body,
    },
  );
}

describe("set shopping item status route", () => {
  it("rejects an unauthenticated request without invoking the service", async () => {
    const setShoppingItemStatus = vi.fn(
      async (): Promise<SetShoppingItemStatusResult> => ({
        kind: "forbidden",
      }),
    );
    const app = createTestRoutes(setShoppingItemStatus);

    const response = await patchShoppingItemStatus({
      app,
      householdId,
      itemId,
      body: JSON.stringify({ status: "crossed" }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    expect(setShoppingItemStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid household ID", "not-a-uuid", itemId],
    ["invalid item ID", householdId, "not-a-uuid"],
  ])("rejects an %s without invoking the service", async (_, household, item) => {
    const setShoppingItemStatus = vi.fn(
      async (): Promise<SetShoppingItemStatusResult> => ({
        kind: "forbidden",
      }),
    );
    const app = createTestRoutes(setShoppingItemStatus);

    const response = await patchShoppingItemStatus({
      app,
      householdId: household,
      itemId: item,
      body: JSON.stringify({ status: "crossed" }),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(400);
    expect(setShoppingItemStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{"],
    ["an invalid status", JSON.stringify({ status: "deleted" })],
    [
      "an extra property",
      JSON.stringify({ status: "crossed", unexpected: true }),
    ],
  ])("rejects %s without invoking the service", async (_, body) => {
    const setShoppingItemStatus = vi.fn(
      async (): Promise<SetShoppingItemStatusResult> => ({
        kind: "forbidden",
      }),
    );
    const app = createTestRoutes(setShoppingItemStatus);

    const response = await patchShoppingItemStatus({
      app,
      householdId,
      itemId,
      body,
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(400);
    expect(setShoppingItemStatus).not.toHaveBeenCalled();
  });

  it("passes trusted identity and validated parameters to the service", async () => {
    const item = {
      id: itemId,
      householdId,
      name: "Whole Milk",
      status: "crossed" as const,
    };
    const setShoppingItemStatus = vi.fn(
      async (): Promise<SetShoppingItemStatusResult> => ({
        kind: "success",
        item,
      }),
    );
    const app = createTestRoutes(setShoppingItemStatus);

    const response = await patchShoppingItemStatus({
      app,
      householdId,
      itemId,
      body: JSON.stringify({ status: "crossed" }),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ item });
    expect(setShoppingItemStatus).toHaveBeenCalledWith({
      userId,
      householdId,
      itemId,
      status: "crossed",
    });
  });

  it("returns generic unauthorized when the authenticated user no longer exists", async () => {
    const app = createTestRoutes(async () => ({ kind: "unauthorized" }));

    const response = await patchShoppingItemStatus({
      app,
      householdId,
      itemId,
      body: JSON.stringify({ status: "crossed" }),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
    });
  });

  it("returns generic forbidden when the user is not a household member", async () => {
    const app = createTestRoutes();

    const response = await patchShoppingItemStatus({
      app,
      householdId,
      itemId,
      body: JSON.stringify({ status: "crossed" }),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Forbidden",
    });
  });

  it("returns not found when the item does not belong to the household", async () => {
    const app = createTestRoutes(async () => ({ kind: "not_found" }));

    const response = await patchShoppingItemStatus({
      app,
      householdId,
      itemId,
      body: JSON.stringify({ status: "crossed" }),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Shopping item not found",
    });
  });
});
