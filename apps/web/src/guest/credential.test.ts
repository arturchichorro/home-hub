import { describe, expect, it } from "vitest";
import { guestCredentialFromHash, guestHash } from "./credential";

describe("Guest URL credential", () => {
  const credential = "a".repeat(43);

  it("reads a valid base64url credential from a fragment", () => {
    expect(guestCredentialFromHash(`#${credential}`)).toBe(credential);
  });

  it.each(["", "#short", `?token=${credential}`, `#${"!".repeat(43)}`])(
    "rejects invalid fragment input (%s)",
    (hash) => expect(guestCredentialFromHash(hash)).toBeUndefined(),
  );

  it("formats navigation fragments without changing the credential", () => {
    expect(guestHash(credential)).toBe(`#${credential}`);
  });
});
