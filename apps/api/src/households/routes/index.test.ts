import type { CreateHouseholdRequest } from "@home-hub/shared/households";
import { describe, expect, it, vi } from "vitest";

import { signAccessToken } from "../../auth/access-token";
import type { CreateHouseholdInput, CreateHouseholdResult } from "../create";
import { createHouseholdRoutes } from "./index";

const jwtSecret = "test-jwt-secret";
const userId = "9f8a6942-f721-499d-957d-7bb3ed1158db";

function createAccessToken() {
  return signAccessToken({
    userId,
    jwtId: "49ef297e-ed36-44b0-913f-0ef66e81887d",
    secret: jwtSecret,
  });
}

function createTestRoutes(
  createHousehold: (
    input: CreateHouseholdInput,
  ) => Promise<CreateHouseholdResult> = async () => ({ kind: "unauthorized" }),
) {
  return createHouseholdRoutes({
    acceptHouseholdInvite: async () => ({ kind: "invalid_invite" }),
    createHousehold,
    createHouseholdInvite: async () => ({ kind: "forbidden" }),
    listHouseholds: async () => ({ kind: "unauthorized" }),
    renameHousehold: async () => ({ kind: "forbidden" }),
    jwtSecret,
  });
}

function postHousehold(input: {
  app: ReturnType<typeof createHouseholdRoutes>;
  body: string;
  accessToken?: string;
}) {
  return input.app.request("/", {
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

describe("household routes", () => {
  it("rejects an unauthenticated request without invoking the service", async () => {
    const createHousehold = vi.fn(
      async (): Promise<CreateHouseholdResult> => ({
        kind: "unauthorized",
      }),
    );
    const app = createTestRoutes(createHousehold);

    const response = await postHousehold({
      app,
      body: JSON.stringify({ name: "Home" }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    expect(createHousehold).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without invoking the service", async () => {
    const createHousehold = vi.fn(
      async (): Promise<CreateHouseholdResult> => ({
        kind: "unauthorized",
      }),
    );
    const app = createTestRoutes(createHousehold);

    const response = await postHousehold({
      app,
      body: "{",
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(400);
    expect(createHousehold).not.toHaveBeenCalled();
  });

  it.each([
    { name: "" },
    { name: "   " },
    { name: "a".repeat(101) },
    { name: "Home", unexpected: true },
  ] satisfies Array<CreateHouseholdRequest | Record<string, unknown>>)(
    "rejects an invalid request without invoking the service: %o",
    async (body) => {
      const createHousehold = vi.fn(
        async (): Promise<CreateHouseholdResult> => ({
          kind: "unauthorized",
        }),
      );
      const app = createTestRoutes(createHousehold);

      const response = await postHousehold({
        app,
        body: JSON.stringify(body),
        accessToken: createAccessToken(),
      });

      expect(response.status).toBe(400);
      expect(createHousehold).not.toHaveBeenCalled();
    },
  );

  it("passes the authenticated user and trimmed name to the service", async () => {
    let receivedInput: CreateHouseholdInput | undefined;
    const household = {
      id: "d92e5c4e-1c68-4942-9cc9-710207661bca",
      name: "Home",
    };
    const app = createTestRoutes(async (input) => {
      receivedInput = input;
      return { kind: "success", household };
    });

    const response = await postHousehold({
      app,
      body: JSON.stringify({ name: "  Home  " }),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ household });
    expect(receivedInput).toEqual({
      userId,
      name: "Home",
    });
  });

  it("returns generic unauthorized when the authenticated user no longer exists", async () => {
    const app = createTestRoutes(async () => ({ kind: "unauthorized" }));

    const response = await postHousehold({
      app,
      body: JSON.stringify({ name: "Home" }),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
    });
  });
});
