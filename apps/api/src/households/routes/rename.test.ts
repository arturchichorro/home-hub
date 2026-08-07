import { describe, expect, it, vi } from "vitest";

import { signAccessToken } from "../../auth/access-token";
import type { RenameHouseholdInput, RenameHouseholdResult } from "../rename";
import { createHouseholdRoutes } from "./index";

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
  renameHousehold: (
    input: RenameHouseholdInput,
  ) => Promise<RenameHouseholdResult> = async () => ({ kind: "forbidden" }),
) {
  return createHouseholdRoutes({
    acceptHouseholdInvite: async () => ({ kind: "invalid_invite" }),
    createHousehold: async () => ({ kind: "unauthorized" }),
    createHouseholdInvite: async () => ({ kind: "forbidden" }),
    listHouseholds: async () => ({ kind: "unauthorized" }),
    listHouseholdInvites: async () => ({ kind: "forbidden" }),
    listHouseholdMembers: async () => ({ kind: "forbidden" }),
    renameHousehold,
    jwtSecret,
  });
}

function patchHousehold(input: {
  app: ReturnType<typeof createHouseholdRoutes>;
  body: string;
  accessToken?: string;
  householdId?: string;
}) {
  return input.app.request(`/${input.householdId ?? householdId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(input.accessToken
        ? { Authorization: `Bearer ${input.accessToken}` }
        : {}),
    },
    body: input.body,
  });
}

describe("rename household route", () => {
  it("rejects an unauthenticated request without invoking the service", async () => {
    const renameHousehold = vi.fn(
      async (): Promise<RenameHouseholdResult> => ({
        kind: "forbidden",
      }),
    );
    const app = createTestRoutes(renameHousehold);

    const response = await patchHousehold({
      app,
      body: JSON.stringify({ name: "Renamed Home" }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    expect(renameHousehold).not.toHaveBeenCalled();
  });

  it("rejects an invalid household id without invoking the service", async () => {
    const renameHousehold = vi.fn(
      async (): Promise<RenameHouseholdResult> => ({
        kind: "forbidden",
      }),
    );
    const app = createTestRoutes(renameHousehold);

    const response = await patchHousehold({
      app,
      householdId: "not-a-uuid",
      body: JSON.stringify({ name: "Renamed Home" }),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(400);
    expect(renameHousehold).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without invoking the service", async () => {
    const renameHousehold = vi.fn(
      async (): Promise<RenameHouseholdResult> => ({
        kind: "forbidden",
      }),
    );
    const app = createTestRoutes(renameHousehold);

    const response = await patchHousehold({
      app,
      body: "{",
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(400);
    expect(renameHousehold).not.toHaveBeenCalled();
  });

  it.each([
    { name: "" },
    { name: "   " },
    { name: "a".repeat(101) },
    { name: "Renamed Home", unexpected: true },
  ] as const)(
    "rejects an invalid request without invoking the service: %o",
    async (body) => {
      const renameHousehold = vi.fn(
        async (): Promise<RenameHouseholdResult> => ({
          kind: "forbidden",
        }),
      );
      const app = createTestRoutes(renameHousehold);

      const response = await patchHousehold({
        app,
        body: JSON.stringify(body),
        accessToken: createAccessToken(),
      });

      expect(response.status).toBe(400);
      expect(renameHousehold).not.toHaveBeenCalled();
    },
  );

  it("passes the authenticated user, household id, and trimmed name to the service", async () => {
    let receivedInput: RenameHouseholdInput | undefined;
    const household = {
      id: householdId,
      name: "Renamed Home",
    };
    const renameHousehold = vi.fn(async (input) => {
      receivedInput = input;
      return { kind: "success" as const, household };
    });
    const app = createTestRoutes(renameHousehold);

    const response = await patchHousehold({
      app,
      body: JSON.stringify({ name: "  Renamed Home  " }),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ household });
    expect(receivedInput).toEqual({
      userId,
      householdId,
      name: "Renamed Home",
    });
  });

  it("maps forbidden to 403", async () => {
    const app = createTestRoutes(async () => ({ kind: "forbidden" }));

    const response = await patchHousehold({
      app,
      body: JSON.stringify({ name: "Renamed Home" }),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("returns generic unauthorized when the authenticated user no longer exists", async () => {
    const app = createTestRoutes(async () => ({ kind: "unauthorized" }));

    const response = await patchHousehold({
      app,
      body: JSON.stringify({ name: "Renamed Home" }),
      accessToken: createAccessToken(),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
    });
  });
});
