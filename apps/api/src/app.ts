import { Hono } from "hono";

import { type CreateAuthRoutesInput, createAuthRoutes } from "./auth/routes";

export type CreateAppInput = CreateAuthRoutesInput;

export function createApp(input: CreateAppInput) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/auth", createAuthRoutes(input));

  return app;
}
