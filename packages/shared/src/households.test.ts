import { describe, expect, it } from "vitest";

import {
  acceptHouseholdInviteRequestSchema,
  createHouseholdRequestSchema,
  listHouseholdInvitesResponseSchema,
  listHouseholdMembersResponseSchema,
  renameHouseholdRequestSchema,
  transferHouseholdOwnershipRequestSchema,
} from "./households";

describe.each([
  ["create household", createHouseholdRequestSchema],
  ["rename household", renameHouseholdRequestSchema],
] as const)("%s request", (_operation, schema) => {
  it("trims a valid household name", () => {
    expect(schema.parse({ name: "  Home  " })).toEqual({ name: "Home" });
  });

  it.each([
    { name: "" },
    { name: "   " },
    { name: "a".repeat(101) },
    { name: "Home", unexpected: true },
  ])("rejects an invalid request: %o", (request) => {
    expect(schema.safeParse(request).success).toBe(false);
  });
});

describe("accept household invite request", () => {
  it("accepts a generated-token-shaped value", () => {
    const token = "a".repeat(43);

    expect(acceptHouseholdInviteRequestSchema.parse({ token })).toEqual({
      token,
    });
  });

  it.each([
    { token: "" },
    { token: "a".repeat(42) },
    { token: "a".repeat(44) },
    { token: `${"a".repeat(42)}+` },
    { token: "a".repeat(43), unexpected: true },
  ])("rejects an invalid request: %o", (request) => {
    expect(acceptHouseholdInviteRequestSchema.safeParse(request).success).toBe(
      false,
    );
  });
});

describe("transfer household ownership request", () => {
  const membershipId = "7dbb2304-955a-4d0b-9878-d39a42a38eb2";

  it("accepts a target membership id", () => {
    expect(
      transferHouseholdOwnershipRequestSchema.parse({ membershipId }),
    ).toEqual({ membershipId });
  });

  it.each([
    { membershipId: "not-a-uuid" },
    { membershipId, unexpected: true },
    {},
  ])("rejects an invalid request: %o", (request) => {
    expect(
      transferHouseholdOwnershipRequestSchema.safeParse(request).success,
    ).toBe(false);
  });
});

const member = {
  id: "7dbb2304-955a-4d0b-9878-d39a42a38eb2",
  username: "artur",
  role: "owner" as const,
  joinedAt: "2026-08-01T12:00:00.000Z",
};

describe("list household members response", () => {
  it("accepts a safe member roster", () => {
    expect(
      listHouseholdMembersResponseSchema.parse({ members: [member] }),
    ).toEqual({ members: [member] });
  });

  it.each([
    { ...member, id: "not-a-uuid" },
    { ...member, role: "admin" },
    { ...member, joinedAt: "not-a-date" },
    { ...member, email: "artur@example.com" },
  ])("rejects an invalid or unsafe member: %o", (invalidMember) => {
    expect(
      listHouseholdMembersResponseSchema.safeParse({
        members: [invalidMember],
      }).success,
    ).toBe(false);
  });

  it("rejects extra top-level fields", () => {
    expect(
      listHouseholdMembersResponseSchema.safeParse({
        members: [member],
        householdId: "d92e5c4e-1c68-4942-9cc9-710207661bca",
      }).success,
    ).toBe(false);
  });
});

const invite = {
  id: "e467b00a-5f80-4c13-aa5b-d2e59996dd82",
  createdAt: "2026-08-01T12:00:00.000Z",
  expiresAt: "2026-08-08T12:00:00.000Z",
};

describe("list household invites response", () => {
  it("accepts safe pending-invite metadata", () => {
    expect(
      listHouseholdInvitesResponseSchema.parse({ invites: [invite] }),
    ).toEqual({ invites: [invite] });
  });

  it.each([
    { ...invite, id: "not-a-uuid" },
    { ...invite, createdAt: "not-a-date" },
    { ...invite, expiresAt: "not-a-date" },
    { ...invite, tokenHash: "secret" },
  ])("rejects invalid or unsafe invite metadata: %o", (invalidInvite) => {
    expect(
      listHouseholdInvitesResponseSchema.safeParse({
        invites: [invalidInvite],
      }).success,
    ).toBe(false);
  });

  it("rejects extra top-level fields", () => {
    expect(
      listHouseholdInvitesResponseSchema.safeParse({
        invites: [invite],
        token: "raw-token",
      }).success,
    ).toBe(false);
  });
});
