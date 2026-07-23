import { createDbClient } from "@home-hub/database/client";
import { serve } from "@hono/node-server";

import { createApp } from "./app";
import { createLoginService } from "./auth/login";
import { createRefreshService } from "./auth/refresh";
import { createSignupService } from "./auth/signup";
import { config } from "./config";

const { db } = createDbClient(config.DATABASE_URL);

const signup = createSignupService({
  db,
  jwtSecret: config.API_JWT_SECRET,
  signupAccessCode: config.SIGNUP_ACCESS_CODE,
});

const login = createLoginService({
  db,
  jwtSecret: config.API_JWT_SECRET,
});

const refresh = createRefreshService({
  db,
  jwtSecret: config.API_JWT_SECRET,
});

const app = createApp({
  signup,
  login,
  refresh,
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
