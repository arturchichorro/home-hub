import { describe, expect, it } from "vitest";
import { generateGuestAccessToken, hashGuestAccessToken } from "./token";

describe("Guest access tokens", () => {
  it("generates independent 32-byte base64url credentials", () => {
    const first = generateGuestAccessToken();
    const second = generateGuestAccessToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
  });

  it("stores a deterministic hash instead of the credential", () => {
    const token = "a".repeat(43);
    const hash = hashGuestAccessToken(token);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashGuestAccessToken(token)).toBe(hash);
  });
});
