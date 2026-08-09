import { describe, expect, it, vi } from "vitest";

import { createApp } from "./app";
import { signAccessToken } from "./auth/access-token";
import type { ZeroDbProvider } from "./zero/db-provider";

const dbProvider = {} as ZeroDbProvider;

describe("app", () => {
  it("returns a successful health response", async () => {
    const app = createApp({
      acceptHouseholdInvite: async () => ({ kind: "invalid_invite" }),
      addShoppingItem: async () => ({ kind: "forbidden" }),
      setShoppingItemStatus: async () => ({ kind: "forbidden" }),
      signup: async () => ({ kind: "forbidden" }),
      login: async () => ({ kind: "invalid_credentials" }),
      refresh: async () => ({ kind: "invalid_token" }),
      logout: async () => undefined,
      getMe: async () => ({ kind: "not_found" }),
      createHousehold: async () => ({ kind: "unauthorized" }),
      createHouseholdInvite: async () => ({ kind: "forbidden" }),
      createRecipeImageUpload: async () => ({ kind: "forbidden" }),
      listHouseholds: async () => ({ kind: "unauthorized" }),
      listHouseholdInvites: async () => ({ kind: "forbidden" }),
      listHouseholdMembers: async () => ({ kind: "forbidden" }),
      leaveHousehold: async () => ({ kind: "forbidden" }),
      transferHouseholdOwnership: async () => ({ kind: "forbidden" }),
      setHouseholdModuleEnabled: async () => ({ kind: "forbidden" }),
      renameHousehold: async () => ({ kind: "forbidden" }),
      revokeHouseholdInvite: async () => ({ kind: "forbidden" }),
      removeHouseholdMember: async () => ({ kind: "forbidden" }),
      dbProvider,
      jwtSecret: "test-jwt-secret",
      isProduction: false,
    });

    const response = await app.request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("mounts household creation at POST /households", async () => {
    const household = {
      id: "d92e5c4e-1c68-4942-9cc9-710207661bca",
      name: "Home",
    };
    const createHousehold = vi.fn(async () => ({
      kind: "success" as const,
      household,
    }));
    const jwtSecret = "test-jwt-secret";
    const app = createApp({
      acceptHouseholdInvite: async () => ({ kind: "invalid_invite" }),
      addShoppingItem: async () => ({ kind: "forbidden" }),
      setShoppingItemStatus: async () => ({ kind: "forbidden" }),
      signup: async () => ({ kind: "forbidden" }),
      login: async () => ({ kind: "invalid_credentials" }),
      refresh: async () => ({ kind: "invalid_token" }),
      logout: async () => undefined,
      getMe: async () => ({ kind: "not_found" }),
      createHousehold,
      createHouseholdInvite: async () => ({ kind: "forbidden" }),
      createRecipeImageUpload: async () => ({ kind: "forbidden" }),
      listHouseholds: async () => ({ kind: "unauthorized" }),
      listHouseholdInvites: async () => ({ kind: "forbidden" }),
      listHouseholdMembers: async () => ({ kind: "forbidden" }),
      leaveHousehold: async () => ({ kind: "forbidden" }),
      transferHouseholdOwnership: async () => ({ kind: "forbidden" }),
      setHouseholdModuleEnabled: async () => ({ kind: "forbidden" }),
      renameHousehold: async () => ({ kind: "forbidden" }),
      revokeHouseholdInvite: async () => ({ kind: "forbidden" }),
      removeHouseholdMember: async () => ({ kind: "forbidden" }),
      dbProvider,
      jwtSecret,
      isProduction: false,
    });
    const accessToken = signAccessToken({
      userId: "9f8a6942-f721-499d-957d-7bb3ed1158db",
      jwtId: "49ef297e-ed36-44b0-913f-0ef66e81887d",
      secret: jwtSecret,
    });

    const response = await app.request("/households", {
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

  it("mounts shopping item addition under its household", async () => {
    const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
    const item = {
      id: "8d46a4c4-4845-4a6d-a937-139633ae1bb9",
      householdId,
      name: "Milk",
      status: "active" as const,
    };
    const addShoppingItem = vi.fn(async () => ({
      kind: "success" as const,
      item,
    }));
    const jwtSecret = "test-jwt-secret";
    const app = createApp({
      acceptHouseholdInvite: async () => ({ kind: "invalid_invite" }),
      addShoppingItem,
      setShoppingItemStatus: async () => ({ kind: "forbidden" }),
      signup: async () => ({ kind: "forbidden" }),
      login: async () => ({ kind: "invalid_credentials" }),
      refresh: async () => ({ kind: "invalid_token" }),
      logout: async () => undefined,
      getMe: async () => ({ kind: "not_found" }),
      createHousehold: async () => ({ kind: "unauthorized" }),
      createHouseholdInvite: async () => ({ kind: "forbidden" }),
      createRecipeImageUpload: async () => ({ kind: "forbidden" }),
      listHouseholds: async () => ({ kind: "unauthorized" }),
      listHouseholdInvites: async () => ({ kind: "forbidden" }),
      listHouseholdMembers: async () => ({ kind: "forbidden" }),
      leaveHousehold: async () => ({ kind: "forbidden" }),
      transferHouseholdOwnership: async () => ({ kind: "forbidden" }),
      setHouseholdModuleEnabled: async () => ({ kind: "forbidden" }),
      renameHousehold: async () => ({ kind: "forbidden" }),
      revokeHouseholdInvite: async () => ({ kind: "forbidden" }),
      removeHouseholdMember: async () => ({ kind: "forbidden" }),
      dbProvider,
      jwtSecret,
      isProduction: false,
    });
    const accessToken = signAccessToken({
      userId: "9f8a6942-f721-499d-957d-7bb3ed1158db",
      jwtId: "49ef297e-ed36-44b0-913f-0ef66e81887d",
      secret: jwtSecret,
    });

    const response = await app.request(
      `/households/${householdId}/shopping/items`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Milk" }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ item });
    expect(addShoppingItem).toHaveBeenCalledWith({
      userId: "9f8a6942-f721-499d-957d-7bb3ed1158db",
      householdId,
      name: "Milk",
    });
  });
});
