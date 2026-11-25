import { execFile as run } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it } from "vitest";

const execFile = promisify(run);
const script = resolve("scripts/export-statistics.sh");
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "home_hub_test_export_wrapper_"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it("passes explicit scope safely to a disposable API-image process using the operator UID and host output mount", async () => {
  const bin = join(directory, "bin");
  await mkdir(bin);
  const capture = join(directory, "args");
  await writeFile(
    join(bin, "docker"),
    '#!/bin/bash\nprintf "%s\\0" "$@" > "$EXPORT_CAPTURE"\n',
    { mode: 0o700 },
  );
  const output = join(directory, "report with spaces.json");
  await execFile(
    "bash",
    [
      script,
      "--household-id",
      "household",
      "--training-user",
      "Exact User",
      "--out",
      output,
    ],
    {
      env: {
        ...process.env,
        PATH: bin + ":" + process.env.PATH,
        EXPORT_CAPTURE: capture,
        HOME_HUB_APP_DIR: directory,
      },
    },
  );
  const args = (await readFile(capture, "utf8")).split("\0").filter(Boolean);
  expect(args).toContain("--rm");
  expect(args).toContain("--no-deps");
  expect(args).toContain("--user");
  expect(args).not.toContain("--build");
  expect(args).toContain((await realpath(directory)) + ":/export:rw");
  expect(args.slice(-6)).toEqual([
    "--household-id",
    "household",
    "--training-user",
    "Exact User",
    "--out",
    "/export/report with spaces.json",
  ]);
});
it("refuses missing/existing destinations and exposes help without invoking Docker", async () => {
  const env = { ...process.env, PATH: "/usr/bin:/bin" };
  await expect(
    execFile("bash", [script, "--household-id", "household"], { env }),
  ).rejects.toMatchObject({ code: 1 });
  const existing = join(directory, "existing");
  await writeFile(existing, "keep");
  await expect(
    execFile("bash", [script, "--out", existing], { env }),
  ).rejects.toMatchObject({ code: 1 });
  expect(await readFile(existing, "utf8")).toBe("keep");
  expect(
    (await execFile("bash", [script, "--help"], { env })).stdout,
  ).toContain("Manual, read-only");
});
