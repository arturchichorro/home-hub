import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const entry = readFileSync(
  new URL("./deploy-production.sh", import.meta.url),
  "utf8",
);
const script = readFileSync(
  new URL("./deploy-release.sh", import.meta.url),
  "utf8",
);
it("checks API and cache health before publishing incompatible Zero clients", () => {
  const cache = script.indexOf("up -d --no-build --wait api zero-cache");
  const web = script.indexOf("up -d --no-build --wait web");
  expect(cache).toBeGreaterThan(-1);
  expect(web).toBeGreaterThan(cache);
  expect(script).toContain("set -euo pipefail");
});
it("retains the backup, migration and readiness checks", () => {
  expect(entry.indexOf("./scripts/backup-production-postgres.sh")).toBeLessThan(
    entry.indexOf("git pull --ff-only"),
  );
  expect(entry).toContain("exec bash ./scripts/deploy-release.sh");
  const migration = script.indexOf("  run ");
  expect(migration).toBeGreaterThan(-1);
  expect(migration).toBeLessThan(
    script.indexOf("up -d --no-build --wait api zero-cache"),
  );
  expect(script).toContain("https://home.achichorro.com/api/ready");
  expect(script).toContain("https://home.achichorro.com/zero/keepalive");
  expect(script).not.toMatch(/down\s+(-v|--volumes)|volume rm|replica\.db.*rm/);
});
