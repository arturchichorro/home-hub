import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthEnv } from "../../auth/bearer-auth";
import { installImageContentRoutes } from "./image-content";

const id = "671874b1-df9d-4a91-8f3c-8055473e8aa2";
const path = `/${id}/recipes/${id}/images/${id}/content?variant=thumbnail`;
function app(allowed = true) {
  const routes = new Hono<AuthEnv>();
  routes.use("*", async (c, next) => {
    c.set("principal", {
      guest: {
        id,
        householdId: id,
        access: "read",
        expiresAt: Date.now() + 10000,
      },
    });
    await next();
  });
  installImageContentRoutes(routes, {
    createRecipeImageReadUrl: async () =>
      allowed
        ? {
            kind: "success",
            url: "http://127.0.0.1:8787/private-signed-url",
            expiresInSeconds: 300,
          }
        : { kind: "forbidden" },
    uploadRecipeImageContent: async () => ({ kind: "forbidden" }),
  });
  return new Hono<AuthEnv>().route("/:householdId/recipes", routes);
}
afterEach(() => vi.unstubAllGlobals());
describe("Guest image delivery failures", () => {
  it.each([
    new TypeError("fetch failed: private-signed-url"),
    new DOMException("Timed out", "TimeoutError"),
  ])(
    "returns a safe upstream error when the Worker cannot be fetched",
    async (error) => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
      const response = await app().request(path);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "Image unavailable" });
    },
  );
  it("does not fetch image bytes when authorization fails", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await app(false).request(path)).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("streams authorized image bytes with no-store", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("image bytes")),
    );
    const response = await app().request(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("image bytes");
  });
});
