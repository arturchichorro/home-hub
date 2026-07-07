import { serve } from "@hono/node-server";
import { Hono } from "hono";

import { config } from "./config";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

serve(
  {
    fetch: app.fetch,
    port: config.API_PORT,
  },
  (info) => {
    console.log(`API listening on http://localhost:${info.port}`);
  },
);
