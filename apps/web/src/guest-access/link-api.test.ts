import QRCode from "qrcode";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGuestLink,
  disableGuestLink,
  guestLinkStatus,
  guestLinkUrl,
  listGuestLinks,
} from "./link-api";

const householdId = "d92e5c4e-1c68-4942-9cc9-710207661bca";
const token = "account-jwt";
afterEach(() => vi.unstubAllGlobals());
describe("owner Guest links", () => {
  it("omits expiration so PostgreSQL's creation service defaults to exactly 90 days", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ link: { id: "link" }, credential: "hhg_v1_secret" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const input = { name: "Kitchen", access: "read" as const };
    expect(await createGuestLink(householdId, token, input)).toMatchObject({
      credential: "hhg_v1_secret",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/households/${householdId}/guest-access-links`,
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        body: JSON.stringify(input),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }),
    );
  });
  it("lists metadata and sends only a scoped link ID when permanently disabling", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ links: [] }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await listGuestLinks(householdId, token)).toEqual([]);
    await disableGuestLink(householdId, token, "link-id");
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/households/${householdId}/guest-access-links/link-id`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });
  it("never exposes server error bodies", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response("sensitive details", { status: 403 }),
    );
    await expect(listGuestLinks(householdId, token)).rejects.toMatchObject({
      status: 403,
      message: "Guest link request failed",
    });
  });
  it("shows permanent disabling ahead of expiration", () => {
    expect(
      guestLinkStatus({ disabledAt: "2026-01-01", expiresAt: "2026-02-01" }),
    ).toBe("Disabled");
    expect(
      guestLinkStatus(
        { disabledAt: null, expiresAt: new Date(10).toISOString() },
        10,
      ),
    ).toBe("Expired");
    expect(
      guestLinkStatus(
        { disabledAt: null, expiresAt: new Date(11).toISOString() },
        10,
      ),
    ).toBe("Active");
  });
  it("generates a QR locally with the secret only in the fragment", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const credential = `hhg_v1_${"A".repeat(43)}`;
    const url = guestLinkUrl(credential, "https://guest.achichorro.com");
    expect(new URL(url).hash).toBe(`#${credential}`);
    expect(new URL(url).pathname).toBe("/join");
    const dataUrl = await QRCode.toDataURL(url, {
      width: 320,
      margin: 4,
      errorCorrectionLevel: "M",
    });
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

it("creates development links at the current origin", () => {
  vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });
  expect(guestLinkUrl("hhg_v1_example")).toBe(
    "http://localhost:5173/join#hhg_v1_example",
  );
});
