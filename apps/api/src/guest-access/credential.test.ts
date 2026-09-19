import type { Database } from "@home-hub/database";
import { describe, expect, it, vi } from "vitest";
import {
  createValidateGuestCredential,
  generateGuestCredential,
  hashGuestCredential,
  isGuestCredential,
} from "./credential";

describe("Guest credentials", () => {
  it("generates independent canonical 256-bit secrets and hashes the entire credential", () => {
    const credentials = Array.from({ length: 100 }, generateGuestCredential);
    expect(new Set(credentials).size).toBe(100);
    for (const credential of credentials) {
      expect(isGuestCredential(credential)).toBe(true);
      expect(Buffer.from(credential.slice(7), "base64url")).toHaveLength(32);
      expect(hashGuestCredential(credential)).toMatch(/^[a-f0-9]{64}$/);
      expect(hashGuestCredential(credential)).not.toBe(
        hashGuestCredential(credential.slice(7)),
      );
    }
  });
  it.each([
    "",
    "hhg_v2_abc",
    "hhg_v1_abc",
    `hhg_v1_${"A".repeat(42)}B`,
    `hhg_v1_${"A".repeat(43)}=`,
    ` hhg_v1_${"A".repeat(43)}`,
  ])(
    "rejects malformed credentials before database access",
    async (credential) => {
      const select = vi.fn();
      const validate = createValidateGuestCredential({
        db: { select } as unknown as Database,
      });
      expect(await validate(credential)).toBeUndefined();
      expect(select).not.toHaveBeenCalled();
    },
  );
});
