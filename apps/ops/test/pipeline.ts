// Disposable fixture only: the production config loader never accepts loopback HTTP.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { diagnosticMessages } from "@home-hub/shared/diagnostics";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { fileAudit } from "../src/audit.ts";
import { LogsReader } from "../src/logs.ts";
import { createLogsServer } from "../src/mcp.ts";

const [mode, directory, port, metricsPort] = process.argv.slice(2);
assert(directory);
const requestId = "147db701-6b85-42f9-b09d-aa39784bf1ca";
const revision = "a".repeat(40);
const secret = "DO_NOT_EXPORT_PRIVATE_CANARY_9a70";
if (mode === "seed") {
  const { sourceDiagnosticFixture } = await import(
    "../../api/test/diagnostics-fixture.ts"
  );
  const emitted = await sourceDiagnosticFixture(secret, requestId);
  await mkdir(join(directory, "docker/a"), { recursive: true });
  await mkdir(join(directory, "operations"), { recursive: true });
  const wrap = (
    service: string,
    payload: unknown,
    project = "home-hub-production",
  ) =>
    JSON.stringify({
      time: new Date().toISOString(),
      stream: "stderr",
      log: typeof payload === "string" ? payload : JSON.stringify(payload),
      attrs: {
        "com.docker.compose.project": project,
        "com.docker.compose.service": service,
        "org.opencontainers.image.revision": revision,
      },
    });
  const lines = [
    wrap("api", {
      ...emitted,
      diagnosticMessage: secret, // Collector must derive the message from its catalogue, not trust this.
      locations: [
        `apps/api/src/${secret}.ts:1:1`,
        "apps/api/src/app.ts:999999:1",
        ...(emitted.locations as string[]),
      ],
      body: secret,
      authorization: `Bearer ${secret}`,
      url: `https://private.invalid/?X-Amz-Signature=${secret}`,
    }),
    wrap("api", {
      event: secret,
      requestId: secret,
      status: secret,
      method: secret,
      route: "/api/private-home-note",
      code: secret,
      message: secret,
      level: secret,
    }),
    wrap(
      "postgres",
      `${new Date().toISOString()} [7] 23505 ERROR: duplicate key ${secret}\nDETAIL: ${secret}\nSTATEMENT: SELECT '${secret}';`,
    ),
    wrap("zero-cache", {
      level: "error",
      message:
        'Cannot replicate table "workout_log_sets" without a PRIMARY KEY or UNIQUE INDEX',
      privateArgs: secret,
    }),
    wrap("web", {
      level: "error",
      msg: secret,
      request: {
        headers: { Authorization: secret },
        uri: `/?signature=${secret}`,
      },
    }),
    wrap(
      "api",
      { event: "http_request", status: 401, body: secret },
      "another-project",
    ),
    wrap("unrelated", { event: "http_request", status: 402, body: secret }),
    wrap("api", {
      event: "http_request",
      status: 403,
      body: secret.repeat(4000),
    }),
  ];
  await writeFile(
    join(directory, "docker/a/a-json.log"),
    `${lines.join("\n")}\n`,
  );
  await writeFile(join(directory, "operations/events.jsonl"), "");
} else if (mode === "verify") {
  const base = `http://127.0.0.1:${port}`;
  const reader = new LogsReader(
    { url: base, tenant: "1", token: "fixture-read-token" },
    fileAudit(join(directory, "audit/queries.jsonl")),
  );
  const server = createLogsServer(reader),
    client = new Client({ name: "fixture-agent", version: "1.0.0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  await client.connect(c);
  try {
    const filters = () => ({
      services: ["api", "zero-cache", "postgres", "web", "deploy", "backup"],
      start: new Date(Date.now() - 300_000).toISOString(),
      end: new Date().toISOString(),
      limit: 200,
    });
    const query = async (extra = {}) => {
      const result = await client.callTool({
        name: "search_logs",
        arguments: { ...filters(), ...extra },
      });
      assert(!result.isError, JSON.stringify(result));
      const content = result.content as { type: string; text: string }[];
      return JSON.parse(content[0]?.text ?? "");
    };
    const all = await query();
    assert(
      !JSON.stringify(all).includes(secret),
      "Private field reached the agent",
    );
    assert(!JSON.stringify(all).includes("signature="));
    const events = all.entries.map(
      (e: { record: { event: string } }) => e.record.event,
    );
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
    ])
      assert(
        events.includes(event),
        `Missing ${event}: ${JSON.stringify(all)}`,
      );
    assert.equal(
      all.entries.filter((e: { service: string }) => e.service === "api")
        .length,
      2,
      "Foreign/oversized input escaped filtering",
    );
    const failedDeploy = all.entries.find(
      (e: { record: { event: string } }) =>
        e.record.event === "deployment_failed",
    );
    assert.equal(failedDeploy.record.phase, "migrate");
    assert.equal(failedDeploy.record.exitCode, "37");
    const failedBackup = all.entries.find(
      (e: { record: { event: string } }) => e.record.event === "backup_failed",
    );
    assert.equal(failedBackup.record.phase, "configuration");
    const known = await query({ services: ["api"], requestId });
    assert.equal(known.entries.length, 1);
    assert.equal(known.entries[0].record.status, "500");
    assert.equal(known.entries[0].record.errorType, "TypeError");
    assert.equal(known.entries[0].record.errorCode, "HH_UNEXPECTED");
    assert.equal(known.entries[0].record.operation, "documents.storage_read");
    assert.equal(
      known.entries[0].record.diagnosticMessage,
      diagnosticMessages.HH_UNEXPECTED,
    );
    assert(
      known.entries[0].record.locations.some((location: string) =>
        location.startsWith("apps/api/src/documents/storage.ts:"),
      ),
    );
    assert.equal(
      (
        await query({
          errorCode: "HH_UNEXPECTED",
          operation: "documents.storage_read",
        })
      ).entries.length,
      1,
    );
    assert.equal(known.entries[0].revision, revision);
    assert.match(known.entries[0].citation, /^loki:/);
    const canary = await query({
      services: ["deploy"],
      event: "collector_canary",
    });
    assert(canary.entries.length > 0 && canary.entries[0].citation);
    assert.equal(
      (await query({ services: ["api"], contains: secret })).entries.length,
      0,
    );
    assert.equal((await query({ limit: 1 })).truncated, true);
    // Inspect the real Loki storage response too, not merely the gateway projection.
    const url = new URL("/loki/api/v1/query_range", base);
    url.search = new URLSearchParams({
      query: '{app="home-hub"}',
      limit: "1000",
      start: String(BigInt(Date.now() - 300_000) * 1_000_000n),
      end: String(BigInt(Date.now()) * 1_000_000n),
    }).toString();
    const raw = await (await fetch(url)).text();
    assert(!raw.includes(secret), "Private field exported to Loki");
    assert(
      !raw.includes("private.invalid") &&
        !raw.includes("Authorization") &&
        !raw.includes("STATEMENT") &&
        !raw.includes("private-home-note"),
    );
    console.log(
      JSON.stringify({
        events: [...new Set(events)],
        citedEvent: canary.entries[0],
        truncationVerified: true,
        rawStorageRedactionVerified: true,
      }),
    );
  } finally {
    await client.close();
    await server.close();
  }
} else if (mode === "flood") {
  const lines = Array.from({ length: 200 }, () =>
    JSON.stringify({
      time: new Date().toISOString(),
      stream: "stdout",
      attrs: {
        "com.docker.compose.project": "home-hub-production",
        "com.docker.compose.service": "api",
        "org.opencontainers.image.revision": revision,
      },
      log: JSON.stringify({
        event: "http_request",
        operation: "http.health",
        requestId: randomUUID(),
        method: "GET",
        route: "/api/health",
        status: 200,
        durationMs: 1,
        body: secret,
      }),
    }),
  );
  await appendFile(
    join(directory, "docker/a/a-json.log"),
    `${lines.join("\n")}\n`,
  );
  await appendFile(
    join(directory, "operations/events.jsonl"),
    `${JSON.stringify({ timestamp: new Date().toISOString(), service: "deploy", event: "collector_canary", exitCode: 0 })}\n`,
  );
} else if (mode === "verify_flood") {
  const reader = new LogsReader(
    {
      url: `http://127.0.0.1:${port}`,
      tenant: "1",
      token: "fixture-read-token",
    },
    fileAudit(join(directory, "audit/queries.jsonl")),
  );
  const times = {
    start: new Date(Date.now() - 300_000).toISOString(),
    end: new Date().toISOString(),
    limit: 200,
  };
  const normal = await reader.search({
    ...times,
    services: ["api"],
    status: 200,
  });
  assert(
    normal.entries.length > 0 && normal.entries.length < 40,
    `Flood not bounded: ${normal.entries.length}`,
  );
  const canary = await reader.search({
    ...times,
    services: ["deploy"],
    event: "collector_canary",
  });
  assert(canary.entries.length >= 2, "Normal traffic starved the canary");
  const metrics = await (
    await fetch(`http://127.0.0.1:${metricsPort}/metrics`)
  ).text();
  assert(
    metrics
      .split("\n")
      .some(
        (line) =>
          line.startsWith("loki_process_dropped_lines_by_label_total{") &&
          Number(line.split(" ").at(-1)) > 0,
      ),
    "Missing throttling evidence",
  );
  console.log(
    JSON.stringify({
      floodInput: 200,
      acceptedNormal: normal.entries.length,
      canarySurvived: true,
      dropCounterVerified: true,
    }),
  );
} else if (mode === "append") {
  await appendFile(
    join(directory, "operations/events.jsonl"),
    `${JSON.stringify({ timestamp: new Date().toISOString(), service: "deploy", event: "collector_canary", exitCode: 0 })}\n`,
  );
} else {
  throw Error("Unknown fixture mode");
}
