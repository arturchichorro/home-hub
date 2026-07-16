import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("returns an encoded Argon2id hash instead of the raw password", async () => {
    const passwordHash = await hashPassword("correct horse battery staple");

    expect(passwordHash).not.toBe("correct horse battery staple");
    expect(passwordHash).toMatch(/^\$argon2id\$/);
  });

  it("verifies the correct password", async () => {
    const passwordHash = await hashPassword("correct horse battery staple");

    await expect(
      verifyPassword({
        password: "correct horse battery staple",
        passwordHash,
      }),
    ).resolves.toBe(true);
  });

  it("rejects the wrong password", async () => {
    const passwordHash = await hashPassword("correct horse battery staple");

    await expect(
      verifyPassword({
        password: "wrong horse battery staple",
        passwordHash,
      }),
    ).resolves.toBe(false);
  });
});
