import { afterEach, describe, expect, it, vi } from "vitest";
import {
  credentialFromFragment,
  guestFragmentUrl,
  validateGuestCredential,
} from "./access";

const credential = `hhg_v1_${"A".repeat(43)}`;
const guest = {
  id: "671874b1-df9d-4a91-8f3c-8055473e8aa2",
  householdId: "d92e5c4e-1c68-4942-9cc9-710207661bca",
  access: "read",
  expiresAt: Date.now() + 10000,
};
afterEach(() => vi.unstubAllGlobals());
describe("Guest entry", () => {
  it("accepts only the canonical fragment credential", () => {
    expect(credentialFromFragment(`#${credential}`)).toBe(credential);
    for (const malformed of [
      "",
      "#hhg_v2_bad",
      `${credential}=`,
      `#token=${credential}`,
    ])
      expect(credentialFromFragment(malformed)).toBeUndefined();
  });
  it("validates before exposing a cache and sends exactly the fragment value as Bearer", async () => {
    const fetchMock = vi.fn(async () => Response.json({ guest }));
    vi.stubGlobal("fetch", fetchMock);
    const storage = { setItem: vi.fn(), getItem: vi.fn() };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);
    expect(await validateGuestCredential(credential)).toEqual({
      credential,
      guest,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/access", {
      headers: { Authorization: `Bearer ${credential}` },
      credentials: "omit",
      cache: "no-store",
    });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.getItem).not.toHaveBeenCalled();
  });
  it.each([
    { guest: { ...guest, expiresAt: 0 } },
    { guest: { ...guest, access: "owner" } },
    { userId: "account" },
    {},
  ])("does not open Guest mode for an invalid response", async (body) => {
    vi.stubGlobal("fetch", async () => Response.json(body));
    expect(await validateGuestCredential(credential)).toBeNull();
  });
  it("keeps the credential exclusively in the fragment when navigating shared routes", () => {
    const url = new URL(
      guestFragmentUrl(
        `/households/${guest.householdId}/recipes`,
        "?sort=title",
        credential,
      ),
      "https://guest.example",
    );
    expect(url.hash).toBe(`#${credential}`);
    expect(url.pathname + url.search).not.toContain(credential);
  });
  it("does not restore expired, disabled, or unknown links", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 401 }));
    expect(await validateGuestCredential(credential)).toBeNull();
  });
});
