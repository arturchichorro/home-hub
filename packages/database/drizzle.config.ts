import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "drizzle-kit";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

loadEnv({ path: resolve(currentDirectory, "../..", ".env") });

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
