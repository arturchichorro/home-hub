import { hash, verify } from "argon2";
import { expect, it } from "vitest";

// Public synthetic fixture produced with Argon2 0.44.0, not a user's password.
const password = "public-upgrade-fixture-password";
const legacyHash =
  "$argon2id$v=19$m=65536,t=3,p=4$LGiY8pL0dRm2gjLbl6ObBg$S/nh1kUHsdiy4sTaDlwpltGjEv1lmJvaAMm5dYeJ62E";
it("verifies existing Argon2 0.44 password hashes after the upgrade", async () => {
  expect(await verify(legacyHash, password)).toBe(true);
  expect(await verify(legacyHash, "wrong-password")).toBe(false);
});
it("creates verifiable Argon2id hashes for new passwords", async () => {
  const encoded = await hash(password);
  expect(encoded).toMatch(/^\$argon2id\$v=19\$/);
  expect(await verify(encoded, password)).toBe(true);
});
