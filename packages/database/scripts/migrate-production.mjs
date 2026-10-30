import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { withPublicSearchPath } from "../src/connection-url.ts";

export const loggingMigrationWhen = 1793354301869;
export const bootstrapRequiredExitCode = 78;

export async function loggingCutoverPending(client) {
  const table = await client.query(
    "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present",
  );
  if (!table.rows[0].present) return true;
  const result = await client.query(
    "SELECT NOT EXISTS (SELECT FROM drizzle.__drizzle_migrations WHERE created_at >= $1) AS pending",
    [loggingMigrationWhen],
  );
  return result.rows[0].pending;
}

async function checkPending(env) {
  const client = new Client({
    connectionString: withPublicSearchPath(env.DATABASE_URL),
  });
  try {
    await client.connect();
    return await loggingCutoverPending(client);
  } finally {
    await client.end();
  }
}

export async function runProductionMigrations({
  env = process.env,
  pending = () => checkPending(env),
  // Dependencies are frozen into the image at build time, not reinstalled by
  // pnpm 12 under the non-root runtime user.
  migrate = () =>
    spawnSync("pnpm", ["--config.verifyDepsBeforeRun=false", "migrate"], {
      stdio: "inherit",
      env,
    }).status ?? 1,
  report = (message) => console.error(message),
} = {}) {
  if (
    env.HOME_HUB_REQUIRE_LOGGING_CUTOVER === "1" &&
    env.HOME_HUB_LOGGING_CUTOVER_READY !== "1" &&
    (await pending())
  ) {
    report(
      "Deployment bootstrap required (78): no migrations applied. Retry with the updated deployment entrypoint so old writers stop and a fresh backup completes first.",
    );
    return bootstrapRequiredExitCode;
  }
  return migrate();
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = await runProductionMigrations();
  } catch (error) {
    console.error(
      "Migration preflight failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    process.exitCode = 1;
  }
}
