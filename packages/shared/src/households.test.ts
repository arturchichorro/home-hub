import { describe, expect, it } from "vitest";

import { createHouseholdRequestSchema } from "./households";

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
