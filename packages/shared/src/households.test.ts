import { describe, expect, it } from "vitest";

import {
  acceptHouseholdInviteRequestSchema,
  createHouseholdRequestSchema,
} from "./households";

describe("create household request", () => {
  it("trims a valid household name", () => {
    expect(
      createHouseholdRequestSchema.parse({
        name: "  Home  ",
      }),
    ).toEqual({ name: "Home" });
  });

  it.each([
    { name: "" },
    { name: "   " },
    { name: "a".repeat(101) },
    { name: "Home", unexpected: true },
  ])("rejects an invalid request: %o", (request) => {
    expect(createHouseholdRequestSchema.safeParse(request).success).toBe(false);
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
