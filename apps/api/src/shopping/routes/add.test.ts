import { describe, expect, it, vi } from "vitest";

import { signAccessToken } from "../../auth/access-token";
import type { AddShoppingItemInput, AddShoppingItemResult } from "../add";
import { createShoppingRoutes } from "./index";

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

function createTestRoutes(
  addShoppingItem: (
    input: AddShoppingItemInput,
  ) => Promise<AddShoppingItemResult> = async () => ({ kind: "forbidden" }),
) {
  return createShoppingRoutes({
    addShoppingItem,
    jwtSecret,
  });
}

function postShoppingItem(input: {
  app: ReturnType<typeof createShoppingRoutes>;
  householdId: string;
  body: string;
  accessToken?: string;
}) {
  return input.app.request(`/${input.householdId}/shopping-items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(input.accessToken
        ? { Authorization: `Bearer ${input.accessToken}` }
        : {}),
    },
    body: input.body,
  });
}

describe("add shopping item route", () => {
  it("rejects an unauthenticated request without invoking the service", async () => {
    const addShoppingItem = vi.fn(
      async (): Promise<AddShoppingItemResult> => ({ kind: "forbidden" }),
    );
    const app = createTestRoutes(addShoppingItem);

    const response = await postShoppingItem({
      app,
      householdId,
      body: JSON.stringify({ name: "Milk" }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    expect(addShoppingItem).not.toHaveBeenCalled();
  });

  it("rejects an invalid household ID without invoking the service", async () => {
    const addShoppingItem = vi.fn(
      async (): Promise<AddShoppingItemResult> => ({ kind: "forbidden" }),
    );
    const app = createTestRoutes(addShoppingItem);

    const response = await postShoppingItem({
      app,
      householdId: "not-a-uuid",
      body: JSON.stringify({ name: "Milk" }),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(400);
    expect(addShoppingItem).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without invoking the service", async () => {
    const addShoppingItem = vi.fn(
      async (): Promise<AddShoppingItemResult> => ({ kind: "forbidden" }),
    );
    const app = createTestRoutes(addShoppingItem);

    const response = await postShoppingItem({
      app,
      householdId,
      body: "{",
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(400);
    expect(addShoppingItem).not.toHaveBeenCalled();
  });

  it("rejects an invalid body without invoking the service", async () => {
    const addShoppingItem = vi.fn(
      async (): Promise<AddShoppingItemResult> => ({ kind: "forbidden" }),
    );
    const app = createTestRoutes(addShoppingItem);

    const response = await postShoppingItem({
      app,
      householdId,
      body: JSON.stringify({ name: "   ", unexpected: true }),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(400);
    expect(addShoppingItem).not.toHaveBeenCalled();
  });

  it("passes trusted identity, household, and cleaned name to the service", async () => {
    const item = {
      id: "8d46a4c4-4845-4a6d-a937-139633ae1bb9",
      householdId,
      name: "Whole Milk",
      status: "active" as const,
    };
    const addShoppingItem = vi.fn(
      async (): Promise<AddShoppingItemResult> => ({
        kind: "success",
        item,
      }),
    );
    const app = createTestRoutes(addShoppingItem);

    const response = await postShoppingItem({
      app,
      householdId,
      body: JSON.stringify({ name: "  Whole   Milk  " }),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ item });
    expect(addShoppingItem).toHaveBeenCalledWith({
      userId,
      householdId,
      name: "Whole Milk",
    });
  });

  it("returns generic unauthorized when the authenticated user no longer exists", async () => {
    const app = createTestRoutes(async () => ({ kind: "unauthorized" }));

    const response = await postShoppingItem({
      app,
      householdId,
      body: JSON.stringify({ name: "Milk" }),
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

    const response = await postShoppingItem({
      app,
      householdId,
      body: JSON.stringify({ name: "Milk" }),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Forbidden",
    });
  });
});
