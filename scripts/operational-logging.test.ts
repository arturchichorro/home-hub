import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

const read = (path: string) =>
  readFile(new URL("../" + path, import.meta.url), "utf8");

it("uses a non-root, capability-dropped collector without Docker or host-network access", async () => {
  const compose = await read("deploy/observability/compose.yml");
  expect(compose).toContain('user: "10001:');
  expect(compose).toContain("cap_drop: [ALL]");
  expect(compose).toContain("127.0.0.1:1514:1514/udp");
  expect(compose).not.toMatch(
    /docker.sock|\/var\/lib\/docker|network_mode:\s*host|privileged:\s*true/,
  );
  expect(compose).toContain("/var/log/home-hub:/operations:ro");
  expect(compose).not.toContain("DOCKER_LOG_DIRECTORY");
});
it("keeps syslog tags short and preserves the canonical 0053 release cutoff", async () => {
  const compose = await read("compose.production.yml");
  expect(compose).toContain("syslog-address: udp://127.0.0.1:1514");
  expect(compose).toContain('cache-max-file: "3"');
  expect(compose).toContain("cache-max-size: 10m");
  expect(compose).toContain("mode: non-blocking");
  expect(compose).toContain("tag: hh-api\n");
  expect(compose).not.toMatch(/tag:.*HOME_HUB_REVISION/);
  expect(await read("scripts/deploy-release.sh")).toContain(
    "created_at >= 1794127975016",
  );
  expect(await read("scripts/deploy-release.sh")).not.toContain(
    "1793354301869",
  );
});
it("assigns the canary to a separate global allowance before normal/error classification", async () => {
  const config = await read("deploy/observability/config.alloy");
  expect(config).toContain(
    'if eq (toString .safeEvent) "collector_canary" }}canary',
  );
  expect(config).toContain("by_label_name");
  expect(config).toContain('"priority"');
  expect(config).not.toContain("/docker-logs");
});
