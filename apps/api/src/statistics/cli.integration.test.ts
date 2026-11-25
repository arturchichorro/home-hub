import { execFile as run } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { createDbClient } from "@home-hub/database/client";
import {
  habitEntries,
  habits,
  householdMembers,
  householdModuleSettings,
  households,
  users,
} from "@home-hub/database/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFile = promisify(run);
const url = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(url))("actual operator CLI process", () => {
  let client: ReturnType<typeof createDbClient>;
  let directory: string;
  const user = randomUUID();
  const household = randomUUID();
  const habit = randomUUID();
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.startsWith("/home_hub_test_")) {
      throw Error("Owned disposable database required");
    }
    client = createDbClient(url);
    directory = await mkdtemp(join(tmpdir(), "home_hub_test_export_cli_"));
    await client.db.insert(users).values({
      id: user,
      username: user,
      email: user + "@invalid.test",
      passwordHash: "DO_NOT_EXPORT",
    });
    await client.db
      .insert(households)
      .values({ id: household, name: "CLI fixture" });
    await client.db.insert(householdMembers).values({
      id: randomUUID(),
      householdId: household,
      userId: user,
      role: "member",
      sortKey: 0,
    });
    await client.db
      .insert(householdModuleSettings)
      .values({ householdId: household, moduleKey: "habits", enabled: true });
    await client.db
      .insert(habits)
      .values({ id: habit, householdId: household, name: "Read" });
    await client.db.insert(habitEntries).values({
      householdId: household,
      habitId: habit,
      userId: user,
      entryOn: "2025-01-01",
      completed: true,
      note: "DO_NOT_EXPORT",
    });
  });
  afterAll(async () => {
    await client?.close();
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  });
  const command = (args: string[]) =>
    execFile(
      process.execPath,
      ["--import", "tsx", "src/statistics/cli.ts", ...args],
      {
        cwd: resolve(import.meta.dirname, "../.."),
        env: { ...process.env, DATABASE_URL: url },
        timeout: 15_000,
      },
    );
  it("writes private complete JSON with no exported data on stdout/stderr", async () => {
    const path = join(directory, "actual.json");
    const result = await command([
      "--household-id",
      household,
      "--out",
      path,
      "--to",
      "2025-01-01",
    ]);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain("DO_NOT_EXPORT");
    const text = await readFile(path, "utf8");
    expect(text).not.toContain("DO_NOT_EXPORT");
    expect(JSON.parse(text).habits.items[0].statistics.completedDays).toBe(1);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
  it("fails without partial output or SQL/private exception text", async () => {
    const path = join(directory, "failed.json");
    await expect(
      command(["--household-id", randomUUID(), "--out", path]),
    ).rejects.toMatchObject({ code: 1, stdout: "" });
    expect(await readdir(directory)).not.toContain("failed.json");
    expect(
      (await readdir(directory)).some((name) => name.endsWith(".tmp")),
    ).toBe(false);
    const result = await command(["--help"]);
    expect(result.stdout).toContain("operator-only");
  });
});
