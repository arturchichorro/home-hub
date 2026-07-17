import { describe, expect, it } from "vitest";

import { app } from "./app";

describe("app", () => {
  it("returns a successful health response", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
