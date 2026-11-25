import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { privateExportFile } from "./cli";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "home_hub_test_export_"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
it("publishes complete JSON as a private file only after the producer succeeds", async () => {
  const path = join(directory, "data.json");
  await privateExportFile(path, async (write) => {
    await write('{"one":');
    await write("1}\n");
    await expect(stat(path)).rejects.toThrow();
  });
  expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ one: 1 });
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  expect(await readdir(directory)).toEqual(["data.json"]);
});
it("cleans staging output on failure without publishing a partial file", async () => {
  await expect(
    privateExportFile(join(directory, "data.json"), async (write) => {
      await write('{"partial":');
      throw Error("fixture failure");
    }),
  ).rejects.toThrow("fixture failure");
  expect(await readdir(directory)).toEqual([]);
});
it("refuses existing files, directories, dangling symlinks and a destination created during export", async () => {
  const path = join(directory, "data.json");
  await writeFile(path, "keep");
  await expect(privateExportFile(path, async () => {})).rejects.toThrow();
  await expect(privateExportFile(directory, async () => {})).rejects.toThrow();
  const symbolic = join(directory, "link.json");
  await symlink(join(directory, "missing"), symbolic);
  await expect(privateExportFile(symbolic, async () => {})).rejects.toThrow();
  const raced = join(directory, "race.json");
  await expect(
    privateExportFile(raced, async (write) => {
      await write("{}");
      await writeFile(raced, "other writer");
    }),
  ).rejects.toThrow();
  expect(await readFile(raced, "utf8")).toBe("other writer");
  expect(await readFile(path, "utf8")).toBe("keep");
  expect((await readdir(directory)).some((name) => name.endsWith(".tmp"))).toBe(
    false,
  );
});
