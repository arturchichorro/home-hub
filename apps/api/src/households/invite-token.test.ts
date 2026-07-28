import { describe, expect, it } from "vitest";

import { generateInviteToken, hashInviteToken } from "./invite-token";

describe("household invite tokens", () => {
  it("generates URL-safe, high-entropy opaque tokens", () => {
    const firstToken = generateInviteToken();
    const secondToken = generateInviteToken();

    expect(firstToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(firstToken).toHaveLength(43);
    expect(secondToken).not.toBe(firstToken);
  });

  it("hashes tokens without retaining the raw value", () => {
    const token = "household-invite-token";
    const tokenHash = hashInviteToken(token);

    expect(tokenHash).not.toBe(token);
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hashes the same token deterministically", () => {
    expect(hashInviteToken("household-invite-token")).toBe(
      hashInviteToken("household-invite-token"),
    );
  });

  it("produces different hashes for different tokens", () => {
    expect(hashInviteToken("first-invite-token")).not.toBe(
      hashInviteToken("second-invite-token"),
    );
  });
});
