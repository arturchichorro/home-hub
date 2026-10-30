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

it("boots from the installed legacy script, refuses unsafe migration, then reconnects into the fresh locked release procedure", () => {
  const dir = mkdtempSync(join(tmpdir(), "home-hub-bootstrap-"));
  try {
    const bin = join(dir, "bin"),
      scripts = join(dir, "scripts"),
      log = join(dir, "commands.log");
    mkdirSync(bin);
    mkdirSync(scripts);
    const local = (text: string) =>
      text
        .replace('"/opt/home-hub"', JSON.stringify(dir))
        .replace(
          '"/tmp/home-hub-production-deploy.lock"',
          JSON.stringify(join(dir, "deploy.lock")),
        );
    const entry = readFileSync(
        new URL("./deploy-production.sh", import.meta.url),
        "utf8",
      ),
      release = readFileSync(
        new URL("./deploy-release.sh", import.meta.url),
        "utf8",
      );
    writeFileSync(
      join(scripts, "deploy-production.sh"),
      local(
        readFileSync(
          new URL(
            "./fixtures/deploy-production-before-cutover.sh",
            import.meta.url,
          ),
          "utf8",
        ),
      ),
      { mode: 0o755 },
    );
    writeFileSync(join(dir, "fresh-entry.sh"), local(entry));
    writeFileSync(
      join(dir, "fresh-release.sh"),
      release.replace(
        "set -euo pipefail",
        'set -euo pipefail\nprintf "fresh-release\\n" >> "$TEST_LOG"',
      ),
    );
    writeFileSync(
      join(scripts, "deploy-release.sh"),
      "#!/usr/bin/env bash\nexit 97\n",
    );
    writeFileSync(
      join(scripts, "backup-production-postgres.sh"),
      '#!/usr/bin/env bash\nprintf "backup\\n" >> "$TEST_LOG"\n',
      { mode: 0o755 },
    );
    const mock = (name: string, body: string) =>
      writeFileSync(
        join(bin, name),
        `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`,
        { mode: 0o755 },
      );
    mock("flock", 'printf "lock\\n" >> "$TEST_LOG"');
    mock("curl", 'printf "health\\n" >> "$TEST_LOG"');
    mock(
      "ssh",
      'printf "ssh\\n" >> "$TEST_LOG"\nexec bash "$TEST_REPO/scripts/deploy-production.sh"',
    );
    mock(
      "git",
      `case "$1" in
 branch) echo main;;
 rev-parse) echo verified-release;;
 pull)
  cp "$TEST_REPO/fresh-entry.sh" "$TEST_REPO/scripts/new-entry"
  mv "$TEST_REPO/scripts/new-entry" "$TEST_REPO/scripts/deploy-production.sh"
  cp "$TEST_REPO/fresh-release.sh" "$TEST_REPO/scripts/new-release"
  mv "$TEST_REPO/scripts/new-release" "$TEST_REPO/scripts/deploy-release.sh"
  printf "fast-forward\\n" >> "$TEST_LOG";;
 esac`,
    );
    mock(
      "docker",
      `printf 'docker %s\\n' "$*" >> "$TEST_LOG"
 case "$*" in
 *to_regclass*) echo t;;
 *created_at*) if [[ -f "$TEST_REPO/applied" ]]; then echo f; else echo t; fi;;
 *"run --rm"*)
  if [[ "$*" != *HOME_HUB_LOGGING_CUTOVER_READY=1* && ! -f "$TEST_REPO/applied" ]]; then
   printf "migration-refused-before-sql\\n" >> "$TEST_LOG"
   exit 78
  fi
  printf "migration-applied\\n" >> "$TEST_LOG"
  touch "$TEST_REPO/applied";;
 esac`,
    );
    execFileSync(
      "bash",
      [new URL("./deploy-via-ssh.sh", import.meta.url).pathname],
      {
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          TEST_LOG: log,
          TEST_REPO: dir,
          VPS_USER: "preview",
          VPS_HOST: "example.invalid",
        },
        stdio: "pipe",
      },
    );
    const commands = readFileSync(log, "utf8").trim().split("\n"),
      refused = commands.indexOf("migration-refused-before-sql"),
      stop = commands.findIndex((line) => line.endsWith("stop api zero-cache")),
      applied = commands.indexOf("migration-applied"),
      backend = commands.findIndex((line) =>
        line.endsWith("up -d --no-build --wait api zero-cache"),
      ),
      web = commands.findIndex((line) =>
        line.endsWith("up -d --no-build --wait web"),
      );
    expect(commands.filter((line) => line === "ssh")).toHaveLength(2);
    expect(commands.filter((line) => line === "lock")).toHaveLength(2);
    expect(refused).toBeGreaterThan(-1);
    expect(stop).toBeGreaterThan(refused);
    expect(commands.lastIndexOf("backup")).toBeGreaterThan(stop);
    expect(applied).toBeGreaterThan(commands.lastIndexOf("backup"));
    expect(backend).toBeGreaterThan(applied);
    expect(web).toBeGreaterThan(backend);
    expect(commands.filter((line) => line === "fresh-release")).toHaveLength(1);
    expect(
      commands.filter((line) => line === "migration-applied"),
    ).toHaveLength(1);
    expect(commands.filter((line) => line === "health")).toHaveLength(3);
    expect(
      commands.some((line) => line.endsWith("up -d --no-build --wait")),
    ).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
