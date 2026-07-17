import { describe, expect, it } from "vitest";

import { isSignupAccessCodeValid } from "./signup";

describe("isSignupAccessCodeValid", () => {
  it("rejects signup when no access code is configured", () => {
    expect(
      isSignupAccessCodeValid({
        configuredAccessCode: undefined,
        submittedAccessCode: "household-code",
      }),
    ).toBe(false);
  });

  it("accepts the configured access code", () => {
    expect(
      isSignupAccessCodeValid({
        configuredAccessCode: "household-code",
        submittedAccessCode: "household-code",
      }),
    ).toBe(true);
  });

  it("rejects an incorrect access code", () => {
    expect(
      isSignupAccessCodeValid({
        configuredAccessCode: "household-code",
        submittedAccessCode: "wrong-code",
      }),
    ).toBe(false);
  });
});
