import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import {
  bootstrapRequiredExitCode,
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
      (entry: { tag: string }) => entry.tag === "0046_tense_miss_america",
    ).when,
  );
});
it("refuses an old production launcher before invoking any migration", async () => {
  const migrate = vi.fn(() => 0),
    report = vi.fn();
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
  for (const call of query.mock.calls) expect(call[0]).toMatch(/^SELECT /);
});
