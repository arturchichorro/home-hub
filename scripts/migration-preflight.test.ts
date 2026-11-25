import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import {
  acknowledgedContactsEnvironment,
  bootstrapRequiredExitCode,
  contactsMigrationWhen,
  loggingCutoverPending,
  loggingMigrationWhen,
  runProductionMigrations,
} from "../packages/database/scripts/migrate-production.mjs";

it("keeps the database gate aligned with the immutable migration journal", () => {
  const journal = JSON.parse(
    readFileSync(
      new URL(
        "../packages/database/drizzle/meta/_journal.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  expect(loggingMigrationWhen).toBe(
    journal.entries.find(
      (entry: { tag: string }) => entry.tag === "0053_unified_training",
    ).when,
  );
});

it("refuses an old production launcher before invoking any migration", async () => {
  const migrate = vi.fn(() => 0);
  const report = vi.fn();
  expect(
    await runProductionMigrations({
      env: { HOME_HUB_REQUIRE_LOGGING_CUTOVER: "1" },

      pending: async () => true,

      migrate,
      report,
    }),
  ).toBe(bootstrapRequiredExitCode);
  expect(migrate).not.toHaveBeenCalled();
  expect(report).toHaveBeenCalledWith(
    expect.stringContaining("no migrations applied"),
  );
});

it.each([
  {
    env: {
      HOME_HUB_REQUIRE_LOGGING_CUTOVER: "1",
      HOME_HUB_LOGGING_CUTOVER_READY: "1",
    },
    pending: true,
  },
  { env: { HOME_HUB_REQUIRE_LOGGING_CUTOVER: "1" }, pending: false },
  { env: {}, pending: true },
])(
  "permits acknowledged cutovers, already applied migrations and local runs: %j",
  async ({ env, pending }) => {
    const migrate = vi.fn(() => 0);
    expect(
      await runProductionMigrations({
        env,

        pending: async () => pending,

        migrate,
      }),
    ).toBe(0);
    expect(migrate).toHaveBeenCalledOnce();
  },
);

it("preserves migration errors instead of turning them into a bootstrap retry", async () => {
  expect(await runProductionMigrations({ env: {}, migrate: () => 1 })).toBe(1);
});

it("runs the native production entrypoint without a pnpm 12 runtime reinstall", () => {
  const dir = mkdtempSync(join(tmpdir(), "home-hub-migrator-command-"));

  try {
    const bin = join(dir, "bin");
    const log = join(dir, "args.log");
    mkdirSync(bin);
    writeFileSync(
      join(bin, "pnpm"),
      '#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$TEST_LOG"\n',
      { mode: 0o755 },
    );
    execFileSync(
      process.execPath,
      [
        new URL(
          "../packages/database/scripts/migrate-production.mjs",
          import.meta.url,
        ).pathname,
      ],
      {
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          HOME_HUB_REQUIRE_LOGGING_CUTOVER: "0",
          TEST_LOG: log,
        },
        stdio: "pipe",
      },
    );
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual([
      "--config.verifyDepsBeforeRun=false",
      "migrate",
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("protects the Contacts cutover separately from training and acknowledges only the migration connection", async () => {
  const journal = JSON.parse(
    readFileSync(
      new URL(
        "../packages/database/drizzle/meta/_journal.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  expect(contactsMigrationWhen).toBe(
    journal.entries.find((e: { tag: string }) => e.tag === "0057_contacts")
      .when,
  );
  const migrate = vi.fn(() => 0);
  expect(
    await runProductionMigrations({
      env: { HOME_HUB_REQUIRE_CONTACTS_CUTOVER: "1" },
      contactsPending: async () => true,
      migrate,
      report: () => {},
    }),
  ).toBe(bootstrapRequiredExitCode);
  expect(migrate).not.toHaveBeenCalled();
  expect(
    await runProductionMigrations({
      env: {
        HOME_HUB_REQUIRE_CONTACTS_CUTOVER: "1",
        HOME_HUB_CONTACTS_CUTOVER_READY: "1",
      },
      contactsPending: async () => true,
      migrate,
    }),
  ).toBe(0);
  const env = {
    DATABASE_URL:
      "postgres://fixture:fixture@localhost/home_hub_test_fixture?options=-c%20statement_timeout%3D1000",
    HOME_HUB_CONTACTS_CUTOVER_READY: "1",
  };
  const next = acknowledgedContactsEnvironment(env);
  expect(new URL(next.DATABASE_URL).searchParams.get("options")).toContain(
    "statement_timeout=1000",
  );
  expect(new URL(next.DATABASE_URL).searchParams.get("options")).toContain(
    "home_hub.contacts_cutover_ready=1",
  );
  expect(env.DATABASE_URL).not.toContain("contacts_cutover_ready");
});
it("checks metadata read-only, including an empty database", async () => {
  const empty = vi.fn().mockResolvedValueOnce({ rows: [{ present: false }] });
  expect(await loggingCutoverPending({ query: empty })).toBe(true);
  expect(empty).toHaveBeenCalledOnce();

  const query = vi
    .fn()
    .mockResolvedValueOnce({ rows: [{ present: true }] })
    .mockResolvedValueOnce({ rows: [{ pending: false }] });
  expect(await loggingCutoverPending({ query })).toBe(false);
  expect(query.mock.calls[1]?.[1]).toEqual([loggingMigrationWhen]);

  for (const call of query.mock.calls) {
    expect(call[0]).toMatch(/^SELECT /);
  }
});
