import { describe, expect, it } from "vitest";

import { createApp } from "./app";

describe("app", () => {
  it("returns a successful health response", async () => {
    const app = createApp({
      signup: async () => ({ kind: "forbidden" }),
      isProduction: false,
    });

    const response = await app.request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
