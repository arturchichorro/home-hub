// Manual synthetic fixture only. No production endpoints, secrets or app writes.
import assert from "node:assert/strict";
import { createSocket } from "node:dgram";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sourceDiagnosticFixture } from "./diagnostics-fixture.ts";

const [mode, directory, port, metricsPort] = process.argv.slice(2);
assert(directory);
const secret = "DO_NOT_EXPORT_PRIVATE_CANARY_9a70";
const revision = "a".repeat(40);
const requestId = "147db701-6b85-42f9-b09d-aa39784bf1ca";
const socket = createSocket("udp4");

async function send(tag: string, payload: unknown) {
  const body =
    typeof payload === "string"
      ? payload
      : JSON.stringify({
          ...(payload as object),
          ...(tag === "hh-api" ? { revision } : {}),
        });
  const frame = `<14>1 ${new Date().toISOString()} fixture-host ${tag} 7 - - ${body}`;
  await new Promise<void>((resolve, reject) =>
    socket.send(Buffer.from(frame), Number(port), "127.0.0.1", (error) =>
      error ? reject(error) : resolve(),
    ),
  );
}
async function logs() {
  const query = new URLSearchParams({
    query: '{app="home-hub",environment="production"}',
    start: String(BigInt(Date.now() - 300_000) * 1_000_000n),
    end: String(BigInt(Date.now()) * 1_000_000n),
    limit: "200",
    direction: "forward",
  });
  const response = await fetch(
    `http://127.0.0.1:${port}/loki/api/v1/query_range?${query}`,
  );
  assert(response.ok);
  const text = await response.text();
  assert(!text.includes(secret), "Private content reached raw Loki storage");
  const result = JSON.parse(text);
  return result.data.result.flatMap(
    (stream: { stream: Record<string, string>; values: [string, string][] }) =>
      stream.values.map(([timestamp, line]) => ({
        labels: stream.stream,
        timestamp,
        record: JSON.parse(line),
      })),
  );
}

try {
  if (mode === "seed") {
    await mkdir(join(directory, "operations"), { recursive: true });
    const emitted = await sourceDiagnosticFixture(secret, requestId);
    assert(
      Array.isArray(emitted.locations) &&
        emitted.locations.some((location: string) =>
          location.startsWith("apps/api/src/documents/storage.ts:"),
        ),
    );
    await writeFile(
      join(directory, "source.json"),
      JSON.stringify({
        ...emitted,
        diagnosticMessage: secret,
        body: secret,
        authorization: secret,
        locations: [
          `apps/api/src/${secret}.ts:1:1`,
          "apps/api/src/app.ts:999999:1",
          ...(emitted.locations as string[]),
        ],
      }),
    );
    await writeFile(join(directory, "operations/events.jsonl"), "");
    await writeFile(
      join(directory, "driver.json"),
      JSON.stringify({
        event: "http_request",
        status: 502,
        method: "GET",
        route: "/api/health",
        revision,
        requestId: "247db701-6b85-42f9-b09d-aa39784bf1ca",
        body: secret,
      }) + "\n",
    );
  } else if (mode === "send") {
    await send(
      "hh-api",
      JSON.parse(await readFile(join(directory, "source.json"), "utf8")),
    );
    await send("hh-api", {
      event: secret,
      requestId: secret,
      diagnosticMessage: secret,
      body: secret,
    });
    await send(
      "hh-postgres",
      `2026-01-01 [7] 23505 ERROR: duplicate ${secret}\nDETAIL: ${secret}`,
    );
    await send("hh-zero-cache", {
      level: "error",
      message:
        'Cannot replicate table "training_sessions" without a PRIMARY KEY or UNIQUE INDEX',
      privateArgs: secret,
    });
    await send("hh-web", {
      level: "error",
      msg: secret,
      request: { uri: `/?signature=${secret}` },
    });
    await send("another-project-api", { event: "http_request", status: 401 });
    await send("hh-unrelated", { event: "http_request", status: 402 });
  } else if (mode === "verify") {
    const entries = await logs();
    for (const event of [
      "http_request",
      "postgres_error",
      "zero_replica_missing_key",
      "operational_log",
      "collector_canary",
      "deployment_succeeded",
      "deployment_failed",
      "backup_succeeded",
      "backup_failed",
    ]) {
      assert(
        entries.some(
          (entry: { record: { event: string } }) =>
            entry.record.event === event,
        ),
        `Missing ${event}: ${JSON.stringify(entries)}`,
      );
    }
    const diagnostic = entries.find(
      (entry: { record: { requestId: string } }) =>
        entry.record.requestId === requestId,
    );
    assert(diagnostic, "Real source diagnostic missing");
    assert.equal(diagnostic.record.errorCode, "HH_UNEXPECTED");
    assert.equal(diagnostic.record.operation, "documents.storage_read");
    assert(
      diagnostic.record.locations.some((location: string) =>
        location.startsWith("apps/api/src/documents/storage.ts:"),
      ),
    );
    assert(!JSON.stringify(diagnostic).includes("999999"));
    assert(
      entries.some(
        (entry: { record: { status: string } }) =>
          entry.record.status === "502",
      ),
      "Real Docker syslog driver did not reach collector",
    );
    assert(
      !entries.some((entry: { record: { status: string } }) =>
        ["401", "402"].includes(entry.record.status),
      ),
    );
    const failed = entries.find(
      (entry: { record: { event: string } }) =>
        entry.record.event === "deployment_failed",
    );
    assert.equal(failed.record.exitCode, "37");
    assert.equal(failed.record.phase, "migrate");
    await writeFile(join(directory, "verified.json"), JSON.stringify(entries));
    console.log(
      "PASS: raw Loki projection, real Docker UDP driver, source diagnostics and release/backup exit preservation.",
    );
  } else if (mode === "flood") {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      for (let index = 0; index < 20; index++) {
        await send("hh-api", {
          event: "http_request",
          status: 200,
          body: secret,
        });
        await send("hh-api", {
          event: "http_request",
          status: 500,
          body: secret,
        });
      }
      await appendFile(
        join(directory, "operations/events.jsonl"),
        JSON.stringify({
          timestamp: new Date().toISOString(),
          service: "deploy",
          event: "collector_canary",
          revision: "b".repeat(40),
        }) + "\n",
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } else if (mode === "verify_flood") {
    const entries = await logs();
    assert(
      entries.some(
        (entry: { labels: { revision: string }; record: { event: string } }) =>
          entry.record.event === "collector_canary" &&
          entry.labels.revision === "b".repeat(40),
      ),
      "Canary starved by normal/error flood",
    );
    const metrics = await (
      await fetch(`http://127.0.0.1:${metricsPort}/metrics`)
    ).text();
    assert(
      metrics
        .split("\n")
        .some(
          (line) =>
            line.startsWith("loki_process_dropped_lines_total") &&
            /rate|limit/i.test(line) &&
            Number(line.split(" ").at(-1)) > 0,
        ),
      "No observed rate limiting",
    );
    console.log(
      "PASS: separate canary allowance survives simultaneous normal and error floods.",
    );
  } else {
    throw Error("Unknown fixture mode");
  }
} finally {
  try {
    socket.close();
  } catch {
    /* Seed/read modes did not open a UDP socket. */
  }
}
