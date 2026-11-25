import { randomUUID } from "node:crypto";
import { link, lstat, open, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createDbClient } from "@home-hub/database/client";
import { exportOptionsSchema, exportStatistics } from "./export";

const usage = `Export household statistics (operator-only, read-only).
--household-id UUID --out FILE
[--training-user USERNAME] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--time-zone ZONE]
No notes/secrets. Current members only. Disabled modules are skipped.
Defaults: lifetime through today, UTC. Output is private JSON; existing paths are never replaced.
On the VPS prefer scripts/export-statistics.sh, which mounts the host output directory.
`;

export async function privateExportFile(
  path: string,
  produce: (write: (chunk: string) => Promise<void>) => Promise<void>,
) {
  const output = resolve(path);
  // Reject files, directories and dangling symlinks before doing database work.
  const exists = await lstat(output).then(
    () => true,
    (error) => {
      if (error.code === "ENOENT") {
        return false;
      }
      throw error;
    },
  );

  if (exists) {
    throw new Error("Output already exists");
  }

  const temporary = join(
    dirname(output),
    `.home-hub-statistics-${randomUUID()}.tmp`,
  );
  const file = await open(temporary, "wx", 0o600);

  try {
    try {
      await produce(async (chunk) => {
        await file.writeFile(chunk);
      });
      await file.sync();
    } finally {
      await file.close();
    }

    // Same-directory hard link is an atomic, no-overwrite publication, even in a race.
    await link(temporary, output);
  } finally {
    await unlink(temporary);
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      "household-id": { type: "string" },
      "training-user": { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      "time-zone": { type: "string" },
      out: { type: "string" },
      help: { type: "boolean" },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    process.stdout.write(usage);
    return;
  }

  if (!values.out || !process.env.DATABASE_URL) {
    throw new Error("Output and database configuration required");
  }

  const options = exportOptionsSchema.parse({
    householdId: values["household-id"],
    trainingUser: values["training-user"],
    from: values.from,
    to: values.to,
    timeZone: values["time-zone"],
  });

  await privateExportFile(values.out, async (write) => {
    const client = createDbClient(process.env.DATABASE_URL as string, {
      connectionTimeoutMillis: 10_000,
    });

    try {
      await exportStatistics(client.db, options, write);
    } finally {
      await client.close();
    }
  });
  process.stderr.write(
    "Statistics export written. Treat the file as sensitive.\n",
  );
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch(() => {
    process.stderr.write(
      "Statistics export failed; no result was published. Check arguments, output path, database access and report size.\n",
    );
    process.exitCode = 1;
  });
}
