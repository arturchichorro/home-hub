import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

import { z } from "zod";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const rootDirectory = resolve(currentDirectory, "../../..");

loadEnv({ path: resolve(rootDirectory, ".env") });

const configSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z
    .string()
    .default("3000")
    .transform((value, context) => {
      const port = Number(value);

      if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
        context.addIssue({
          code: "custom",
          message: "API_PORT must be an integer between 1 and 65535",
        });

        return z.NEVER;
      }

      return port;
    }),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  API_JWT_SECRET: z
    .string()
    .min(32, "API_JWT_SECRET must be at least 32 characters"),
  SIGNUP_ACCESS_CODE: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export const config = configSchema.parse(process.env);
