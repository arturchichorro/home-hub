import { describe, expect, it } from "vitest";

import { generateRefreshToken, hashRefreshToken } from "./refresh-token";

describe("refresh tokens", () => {
  it("generates URL-safe, high-entropy opaque tokens", () => {
    const firstToken = generateRefreshToken();
    const secondToken = generateRefreshToken();

    expect(firstToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(firstToken).toHaveLength(43);
    expect(secondToken).not.toBe(firstToken);
  });

  it("hashes tokens without retaining the raw value", () => {
    const token = "refresh-token";
    const tokenHash = hashRefreshToken(token);

    expect(tokenHash).not.toBe(token);
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hashes the same token deterministically", () => {
    expect(hashRefreshToken("refresh-token")).toBe(
      hashRefreshToken("refresh-token"),
    );
  });

  it("produces different hashes for different tokens", () => {
    expect(hashRefreshToken("first-token")).not.toBe(
      hashRefreshToken("second-token"),
    );
  });
});
