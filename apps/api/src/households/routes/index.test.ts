import { expect, it, vi } from "vitest";
import { createHouseholdRoutes } from "./index";

function routes() {
  const createHouseholdInvite = vi.fn(async () => ({
    kind: "forbidden" as const,
  }));
  const acceptHouseholdInvite = vi.fn(async () => ({
    kind: "invalid_invite" as const,
  }));
  return {
    app: createHouseholdRoutes({
      jwtSecret: "fixture",
      createHouseholdInvite,
      acceptHouseholdInvite,
    }),
    createHouseholdInvite,
    acceptHouseholdInvite,
  };
}

it.each([
  ["GET", "/"],
  ["POST", "/"],
  ["PATCH", "/household"],
  ["DELETE", "/household"],
  ["GET", "/household/members"],
  ["GET", "/household/invites"],
  ["DELETE", "/household/members/member"],
  ["DELETE", "/household/membership"],
  ["PATCH", "/household/ownership"],
  ["PATCH", "/household/modules/contacts"],
  ["DELETE", "/household/invites/invite"],
])(
  "does not expose ordinary household CRUD over HTTP: %s %s",
  async (method, path) => {
    const { app, createHouseholdInvite, acceptHouseholdInvite } = routes();
    expect((await app.request(path, { method })).status).toBe(404);
    expect(createHouseholdInvite).not.toHaveBeenCalled();
    expect(acceptHouseholdInvite).not.toHaveBeenCalled();
  },
);

it.each(["/household/invites", "/invites/accept"])(
  "keeps secret invitation exchanges authenticated: %s",
  async (path) => {
    const { app, createHouseholdInvite, acceptHouseholdInvite } = routes();
    expect((await app.request(path, { method: "POST" })).status).toBe(401);
    expect(createHouseholdInvite).not.toHaveBeenCalled();
    expect(acceptHouseholdInvite).not.toHaveBeenCalled();
  },
);
