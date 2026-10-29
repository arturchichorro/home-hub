import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "dotenv";
import { afterEach, expect, it } from "vitest";

const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function directory() {
  const path = mkdtempSync(join(tmpdir(), "home-hub-env-test-"));
  directories.push(path);
  return path;
}
it("preserves injected environment values and literal quoted credentials", () => {
  const path = join(directory(), ".env");
  writeFileSync(
    path,
    "EXISTING=file-value\r\nLITERAL='literal$test#value'\r\nURL=\"https://example.invalid/?x=1&y=2\"\r\nEMPTY=\r\n",
  );
  const env: Record<string, string> = { EXISTING: "injected-value" };
  const result = config({ path, processEnv: env, quiet: true });
  expect(result.error).toBeUndefined();
  expect(env).toEqual({
    EXISTING: "injected-value",
    LITERAL: "literal$test#value",
    URL: "https://example.invalid/?x=1&y=2",
    EMPTY: "",
  });
});
it("does not throw or discard injected values when a container has no .env file", () => {
  const env = { EXISTING: "injected-value" };
  const result = config({
    path: join(directory(), "missing"),
    processEnv: env,
    quiet: true,
  });
  expect(result.error).toMatchObject({ code: "ENOENT" });
  expect(env.EXISTING).toBe("injected-value");
});
