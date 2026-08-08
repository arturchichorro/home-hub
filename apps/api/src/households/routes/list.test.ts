import { describe, expect, it, vi } from "vitest";

import { signAccessToken } from "../../auth/access-token";
import type { ListHouseholdsResult } from "../list";
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
  listHouseholds: (
    userId: string,
  ) => Promise<ListHouseholdsResult> = async () => ({
    kind: "unauthorized",
  }),
) {
  return createHouseholdRoutes({
    acceptHouseholdInvite: async () => ({ kind: "invalid_invite" }),
    createHousehold: async () => ({ kind: "unauthorized" }),
    createHouseholdInvite: async () => ({ kind: "forbidden" }),
    listHouseholds,
    listHouseholdInvites: async () => ({ kind: "forbidden" }),
    listHouseholdMembers: async () => ({ kind: "forbidden" }),
    renameHousehold: async () => ({ kind: "forbidden" }),
    revokeHouseholdInvite: async () => ({ kind: "forbidden" }),
    jwtSecret,
  });
}

function getHouseholds(
  app: ReturnType<typeof createHouseholdRoutes>,
  accessToken?: string,
) {
  return app.request("/", {
    ...(accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : {}),
  });
}

describe("list household route", () => {
  it("rejects an unauthenticated request without invoking the service", async () => {
    const listHouseholds = vi.fn(
      async (): Promise<ListHouseholdsResult> => ({
        kind: "unauthorized",
      }),
    );
    const app = createTestRoutes(listHouseholds);

    const response = await getHouseholds(app);

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    expect(listHouseholds).not.toHaveBeenCalled();
  });

  it("passes the authenticated user to the service and returns its households", async () => {
    const households = [
      {
        id: "d92e5c4e-1c68-4942-9cc9-710207661bca",
        name: "Home",
        role: "owner" as const,
      },
    ];
    const listHouseholds = vi.fn(
      async (): Promise<ListHouseholdsResult> => ({
        kind: "success",
        households,
      }),
    );
    const app = createTestRoutes(listHouseholds);

    const response = await getHouseholds(app, createAccessToken());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ households });
    expect(listHouseholds).toHaveBeenCalledWith(userId);
  });

  it("returns generic unauthorized when the authenticated user no longer exists", async () => {
    const app = createTestRoutes();

    const response = await getHouseholds(app, createAccessToken());

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
    });
  });
});
