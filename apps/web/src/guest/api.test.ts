import { afterEach, describe, expect, it, vi } from "vitest";
import { getGuestAccessContext, zeroGuestAuthorization } from "./api";

const credential = "a".repeat(43);
const context = {
  guestAccessLinkId: "8d46a4c4-4845-4a6d-a937-139633ae1bb9",
  access: "write",
  cacheIdentity: "guest-link:8d46a4c4-4845-4a6d-a937-139633ae1bb9",
  expiresAt: "2026-12-18T12:00:00.000Z",
  enabledModules: ["recipes"],
  household: {
    id: "d92e5c4e-1c68-4942-9cc9-710207661bca",
    name: "Coliving",
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("Guest access API", () => {
  it("presents the direct credential with the Guest scheme", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json(context));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getGuestAccessContext(credential)).resolves.toEqual({
      kind: "success",
      context,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/guest/context", {
      headers: { Authorization: `Guest ${credential}` },
    });
  });

  it("maps every unauthorized link state to unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json({ error: "Unauthorized" }, { status: 401 }),
      ),
    );
    await expect(getGuestAccessContext(credential)).resolves.toEqual({
      kind: "unavailable",
    });
  });

  it("uses an unambiguous envelope for Zero's Bearer-only transport", () => {
    expect(zeroGuestAuthorization(credential)).toBe(`guest-v1.${credential}`);
  });
});
