import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { withPublicSearchPath } from "../src/connection-url.ts";

export const loggingMigrationWhen = 1794127975016;
export const contactsMigrationWhen = 1795533820795;

export const bootstrapRequiredExitCode = 78;

export async function loggingCutoverPending(
  client,
  cutoff = loggingMigrationWhen,
) {
  const table = await client.query(
    "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present",
  );

  if (!table.rows[0].present) {
    return true;
  }

  const result = await client.query(
    "SELECT NOT EXISTS (SELECT FROM drizzle.__drizzle_migrations WHERE created_at >= $1) AS pending",
    [cutoff],
  );

  return result.rows[0].pending;
}

async function checkPending(env, cutoff = loggingMigrationWhen) {
  const client = new Client({
    connectionString: withPublicSearchPath(env.DATABASE_URL),
  });

  try {
    await client.connect();

    return await loggingCutoverPending(client, cutoff);
  } finally {
    await client.end();
  }
}

export function acknowledgedContactsEnvironment(env) {
  const url = new URL(env.DATABASE_URL);
  url.searchParams.set(
    "options",
    [url.searchParams.get("options"), "-c home_hub.contacts_cutover_ready=1"]
      .filter(Boolean)
      .join(" "),
  );
  return { ...env, DATABASE_URL: url.toString() };
}

export async function runProductionMigrations({
  env = process.env,
  pending = () => checkPending(env),
  contactsPending = () => checkPending(env, contactsMigrationWhen),
  // Dependencies are frozen into the image at build time, not reinstalled by
  // pnpm 12 under the non-root runtime user.
  migrate = () =>
    spawnSync("pnpm", ["--config.verifyDepsBeforeRun=false", "migrate"], {
      stdio: "inherit",
      env:
        env.HOME_HUB_CONTACTS_CUTOVER_READY === "1"
          ? acknowledgedContactsEnvironment(env)
          : env,
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

  if (
    env.HOME_HUB_REQUIRE_CONTACTS_CUTOVER === "1" &&
    env.HOME_HUB_CONTACTS_CUTOVER_READY !== "1" &&
    (await contactsPending())
  ) {
    report(
      "Contacts cutover required (78): no migrations applied. Explicit approval, stopped writers and a fresh backup are required before discarding legacy Logs.",
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
