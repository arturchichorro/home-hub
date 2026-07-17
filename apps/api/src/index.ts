import { createDbClient } from "@home-hub/database/client";
import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { createSignupService } from "./auth/signup";
import { config } from "./config";

const { db } = createDbClient(config.DATABASE_URL);

const signup = createSignupService({
  db,
  jwtSecret: config.API_JWT_SECRET,
  signupAccessCode: config.SIGNUP_ACCESS_CODE,
});

const app = createApp({
  signup,
  isProduction: config.NODE_ENV === "production",
});

serve(
  {
    fetch: app.fetch,
    port: config.API_PORT,
  },
  (info) => {
    console.log(`API listening on http://localhost:${info.port}`);
  },
);
