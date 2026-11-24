// Called only by the manual disposable pipeline; production config rejects HTTP.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { fileAudit } from "../src/audit.ts";
import { LogsReader } from "../src/logs.ts";
import { createLogsServer } from "../src/mcp.ts";

const [directory, port] = process.argv.slice(2);
assert(directory && port);
const reader = new LogsReader(
  { url: `http://127.0.0.1:${port}`, tenant: "1", token: "fixture-read-token" },
  fileAudit(join(directory, "audit/queries.jsonl")),
);
const server = createLogsServer(reader);
const client = new Client({ name: "fixture-agent", version: "1.0.0" });
const [caller, transport] = InMemoryTransport.createLinkedPair();
await server.connect(transport);
await client.connect(caller);
try {
  const tools = await client.listTools();
  assert.deepEqual(
    tools.tools.map((tool) => tool.name),
    ["search_logs"],
  );
  assert.equal(tools.tools[0]?.annotations?.readOnlyHint, true);
  const filters = {
    services: ["api", "zero-cache", "postgres", "web", "deploy", "backup"],
    start: new Date(Date.now() - 300_000).toISOString(),
    end: new Date().toISOString(),
    limit: 200,
  };
  const result = await client.callTool({
    name: "search_logs",
    arguments: {
      ...filters,
      services: ["api"],
      requestId: "147db701-6b85-42f9-b09d-aa39784bf1ca",
    },
  });
  assert(!result.isError, JSON.stringify(result));
  const content = result.content as { type: string; text: string }[];
  const known = JSON.parse(content[0]?.text ?? "");
  assert.equal(known.entries.length, 1);
  assert.equal(known.entries[0].record.operation, "documents.storage_read");
  assert.equal(known.entries[0].record.errorCode, "HH_UNEXPECTED");
  assert.equal(known.entries[0].revision, "a".repeat(40));
  assert.match(known.entries[0].citation, /^loki:/);
  assert.equal(known.source.backend, "127.0.0.1");
  assert(!JSON.stringify(known).includes("DO_NOT_EXPORT"));
  const limited = await client.callTool({
    name: "search_logs",
    arguments: { ...filters, limit: 1 },
  });
  assert(!limited.isError);
  const limitedContent = limited.content as { type: string; text: string }[];
  const truncated = JSON.parse(limitedContent[0]?.text ?? "");
  assert.equal(truncated.entries.length, 1);
  assert.equal(truncated.truncated, true);
  const audit = await readFile(join(directory, "audit/queries.jsonl"), "utf8");
  assert(
    audit.includes('"phase":"started"') &&
      audit.includes('"phase":"completed"'),
  );
  assert(
    !audit.includes("fixture-read-token") && !audit.includes("DO_NOT_EXPORT"),
  );
  console.log(
    "PASS: actual MCP protocol, sole read-only tool, cited source diagnostic, truncation and private audit.",
  );
} finally {
  await client.close();
  await server.close();
}
