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
import { afterEach, expect, it } from "vitest";

const source = readFileSync(
  new URL("./deploy-release.sh", import.meta.url),
  "utf8",
);
const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function rehearse(hasTable: boolean, applied: boolean) {
  const directory = mkdtempSync(join(tmpdir(), "home-hub-cutover-"));
  directories.push(directory);
  const bin = join(directory, "bin"),
    log = join(directory, "commands.log");
  mkdirSync(bin);
  mkdirSync(join(directory, "scripts"));
  const mock = (name: string, body: string) =>
    writeFileSync(
      join(bin, name),
      `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`,
      { mode: 0o755 },
    );
  mock(
    "git",
    'case "$1" in branch) echo main;; rev-parse) echo test-only;; esac',
  );
  mock("flock", "exit 0");
  mock("curl", 'printf "curl\\n" >> "$TEST_LOG"');
  mock(
    "docker",
    'printf "docker %s\\n" "$*" >> "$TEST_LOG"\ncase "$*" in *to_regclass*) echo "$TEST_TABLE";; *created_at*) echo "$TEST_CUTOVER";; esac',
  );
  writeFileSync(
    join(directory, "scripts/backup-production-postgres.sh"),
    '#!/usr/bin/env bash\nprintf "backup\\n" >> "$TEST_LOG"\n',
    { mode: 0o755 },
  );
  const script = source
    .replace('"/opt/home-hub"', JSON.stringify(directory))
    .replace(
      '"/tmp/home-hub-production-deploy.lock"',
      JSON.stringify(join(directory, "deploy.lock")),
    );
  execFileSync("bash", ["-c", script], {
    cwd: directory,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      TEST_LOG: log,
      TEST_TABLE: hasTable ? "t" : "f",
      TEST_CUTOVER: applied ? "f" : "t",
    },
    stdio: "pipe",
  });
  return readFileSync(log, "utf8").trim().split("\n");
}
it("keeps the one-time writer cutover aligned with the actual migration journal", () => {
  const journal = JSON.parse(
    readFileSync(
      new URL(
        "../packages/database/drizzle/meta/_journal.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as { entries: { tag: string; when: number }[] };
  const migration = journal.entries.find(
    (entry) => entry.tag === "0046_tense_miss_america",
  );
  expect(migration).toBeDefined();
  expect(source).toContain(`created_at >= ${migration?.when}`);
});
it.each([
  { hasTable: true, applied: false },
  { hasTable: false, applied: false },
  { hasTable: true, applied: true },
])("orders the real deployment script safely: %j", ({ hasTable, applied }) => {
  const commands = rehearse(hasTable, applied),
    stop = commands.findIndex((line) => line.endsWith("stop api zero-cache")),
    migrate = commands.findIndex((line) =>
      /run --rm(?: -e HOME_HUB_LOGGING_CUTOVER_READY=1)? migrate$/.test(line),
    ),
    backend = commands.findIndex((line) =>
      line.endsWith("up -d --no-build --wait api zero-cache"),
    ),
    web = commands.findIndex((line) =>
      line.endsWith("up -d --no-build --wait web"),
    );
  expect(migrate).toBeGreaterThan(-1);
  expect(backend).toBeGreaterThan(migrate);
  expect(web).toBeGreaterThan(backend);
  expect(commands[migrate]?.includes("HOME_HUB_LOGGING_CUTOVER_READY=1")).toBe(
    !applied,
  );
  if (applied) {
    expect(stop).toBe(-1);
    // The locked bootstrap takes the routine pre-update backup.
    expect(commands.filter((line) => line === "backup")).toHaveLength(0);
  } else {
    expect(stop).toBeGreaterThan(-1);
    expect(stop).toBeLessThan(migrate);
    expect(commands.lastIndexOf("backup")).toBeGreaterThan(stop);
    expect(commands.lastIndexOf("backup")).toBeLessThan(migrate);
  }
});
