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
import { expect, it } from "vitest";

it.each([
  { first: 78, second: 0, expected: 0, count: 2 },
  { first: 78, second: 78, expected: 78, count: 2 },
  { first: 1, second: 0, expected: 1, count: 1 },
  { first: 255, second: 0, expected: 255, count: 1 },
])(
  "reconnects only once and only for the preflight exit: %j",
  ({ first, second, expected, count }) => {
    const dir = mkdtempSync(join(tmpdir(), "home-hub-ssh-"));
    try {
      const bin = join(dir, "bin"),
        log = join(dir, "ssh.log");
      mkdirSync(bin);
      writeFileSync(
        join(bin, "ssh"),
        '#!/usr/bin/env bash\nset -eu\nif [[ -f "$TEST_LOG" ]]; then status="$SECOND"; else status="$FIRST"; fi\nprintf "ssh %s\\n" "$*" >> "$TEST_LOG"\nexit "$status"\n',
        { mode: 0o755 },
      );
      let code = 0;
      try {
        execFileSync(
          "bash",
          [new URL("./deploy-via-ssh.sh", import.meta.url).pathname],
          {
            env: {
              ...process.env,
              PATH: `${bin}:${process.env.PATH}`,
              TEST_LOG: log,
              FIRST: String(first),
              SECOND: String(second),
              VPS_USER: "preview",
              VPS_HOST: "example.invalid",
            },
            stdio: "pipe",
          },
        );
      } catch (error) {
        code = (error as { status: number }).status;
      }
      expect(code).toBe(expected);
      const calls = readFileSync(log, "utf8").trim().split("\n");
      expect(calls).toHaveLength(count);
      expect(calls[0]).toContain("StrictHostKeyChecking=yes");
      expect(calls[0]).toContain("BatchMode=yes");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
