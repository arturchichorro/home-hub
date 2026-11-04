import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { fileAudit } from "./audit.ts";
import {
  type AuditRecord,
  compileQuery,
  LogsReader,
  loadLogsConfig,
  searchSchema,
} from "./logs.ts";
import { createLogsServer } from "./mcp.ts";

const now = Date.parse("2026-11-04T12:00:00Z");
const input = {
  services: ["api"],
  start: "2026-11-04T11:00:00Z",
  end: "2026-11-04T12:00:00Z",
};
const config = {
  url: "https://logs-prod-test.grafana.net",
  tenant: "12345",
  token: "secret-read-token-not-returned",
};
const timestamp = String(BigInt(now - 10_000) * 1_000_000n);
const line = JSON.stringify({
  event: "http_request",
  status: "500",
  requestId: "147db701-6b85-42f9-b09d-aa39784bf1ca",
});
function body(lines = [line], stream: Record<string, string> = {}) {
  return {
    status: "success",
    data: {
      resultType: "streams",
      result: [
        {
          stream: {
            app: "home-hub",
            environment: "production",
            service: "api",
            ...stream,
          },
          values: lines.map((l) => [timestamp, l]),
        },
      ],
    },
  };
}
const response = (data: unknown) => new Response(JSON.stringify(data));
function fixture(data = body()) {
  const audit = vi.fn<(record: AuditRecord) => Promise<void>>(async () => {});
  const fetcher = vi.fn<typeof fetch>(async () => response(data));
  return {
    reader: new LogsReader(config, audit, fetcher, () => now),
    audit,
    fetcher,
  };
}

describe("bounded read-only log queries", () => {
  it("returns stable citations, exact nanoseconds and reproducible sources without credentials", async () => {
    const { reader, fetcher, audit } = fixture();
    const a = await reader.search(input),
      b = await reader.search(input);
    expect(a.entries[0]?.citation).toBe(b.entries[0]?.citation);
    expect(a.entries[0]?.timestamp).toBe(timestamp);
    expect(JSON.stringify(a)).not.toContain(config.token);
    expect(a.source.query).toContain('app="home-hub",environment="production"');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      redirect: "error",
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("limit=51");
    expect(audit.mock.calls.map((x) => x[0].phase)).toEqual([
      "started",
      "completed",
      "started",
      "completed",
    ]);
  });
  it.each([
    { query: '{app=~".*"}' },
    { services: ["arbitrary"] },
    { services: [] },
    { limit: 201 },
    { start: "2026-10-01T00:00:00Z" },
    { end: "2026-11-04T12:01:00Z" },
    { start: "2026-11-04T01:00:00Z" },
    { end: input.start },
    { requestId: "Bearer SECRET" },
    { revision: "main" },
    { environment: "other" },
    { url: "http://169.254.169.254/" },
    { contains: "unsafe\nline" },
  ])(
    "rejects invalid/wide/foreign inputs before backend access: %j",
    async (extra) => {
      const { reader, fetcher } = fixture();
      await expect(reader.search({ ...input, ...extra })).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("escapes search text as a literal, never accepting LogQL", () => {
    const contains = '\\"} |~ ".*"';
    expect(compileQuery(searchSchema.parse({ ...input, contains }))).toContain(
      ` |= ${JSON.stringify(contains)} | json`,
    );
  });
  it("reports truncation using a lookahead instead of silently clipping", async () => {
    const { reader } = fixture(body([line, line]));
    const result = await reader.search({ ...input, limit: 1 });
    expect(result.entries).toHaveLength(1);
    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toBe("result_limit");
  });
  it("fails closed if auditing is unavailable, including completion auditing", async () => {
    const fetcher = vi.fn(async () => response(body()));
    const fail = vi.fn(async () => {
      throw Error("private disk detail");
    });
    await expect(
      new LogsReader(config, fail, fetcher, () => now).search(input),
    ).rejects.toThrow("Log search unavailable");
    expect(fetcher).not.toHaveBeenCalled();
    const completionFail = vi.fn(async ({ phase }) => {
      if (phase === "completed") throw Error("disk full");
    });
    await expect(
      new LogsReader(config, completionFail, fetcher, () => now).search(input),
    ).rejects.toThrow("Log search unavailable");
  });
  it.each([401, 403, 429, 500])(
    "does not echo backend error bodies (HTTP %s)",
    async (status) => {
      const fetcher = vi.fn(
        async () =>
          new Response("Authorization secret and private note", { status }),
      );
      await expect(
        new LogsReader(
          config,
          async () => {},
          fetcher,
          () => now,
        ).search(input),
      ).rejects.toThrow(`HTTP ${status}`);
    },
  );
  it("caps decompressed response bytes", async () => {
    const fetcher = vi.fn(
      async () => new Response("x".repeat(2 * 1024 * 1024 + 1)),
    );
    await expect(
      new LogsReader(
        config,
        async () => {},
        fetcher,
        () => now,
      ).search(input),
    ).rejects.toThrow("2 MiB");
  });
  it.each([
    { service: "backup" },
    { app: "other" },
    { environment: "staging" },
  ])("refuses unexpected streams: %j", async (stream) => {
    await expect(
      fixture(body([line], stream)).reader.search(input),
    ).rejects.toThrow("Unexpected log stream");
  });
  it("rejects malformed results and strips unknown record fields", async () => {
    await expect(
      fixture({ status: "success" } as ReturnType<typeof body>).reader.search(
        input,
      ),
    ).rejects.toThrow("Unexpected log backend");
    const result = await fixture(
      body([JSON.stringify({ event: "http_request", privateNote: "PRIVATE" })]),
    ).reader.search(input);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    await expect(
      fixture(body(['{"event":"PRIVATE"}'])).reader.search(input),
    ).rejects.toThrow("Unexpected log record");
  });
  it("enforces per-process rate limits and concurrent limits", async () => {
    const { reader } = fixture();
    for (let i = 0; i < 20; i++) await reader.search(input);
    await expect(reader.search(input)).rejects.toThrow("query limit");
    let release: () => void = () => {};
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetcher = vi.fn(async () => {
      await wait;
      return response(body());
    });
    const concurrent = new LogsReader(
      config,
      async () => {},
      fetcher,
      () => now,
    );
    const a = concurrent.search(input),
      b = concurrent.search(input);
    await expect(concurrent.search(input)).rejects.toThrow("query limit");
    release();
    await Promise.all([a, b]);
  });
  it.each([
    "http://logs-test.grafana.net",
    "https://evil.example",
    "https://a.grafana.net/other",
    "https://user:pass@a.grafana.net",
    "https://a.grafana.net?token=x",
  ])("rejects unsafe stack origins: %s", (url) => {
    expect(() =>
      loadLogsConfig({
        HOME_HUB_LOKI_URL: url,
        HOME_HUB_LOKI_TENANT: "12345",
        HOME_HUB_LOKI_READ_TOKEN: config.token,
      }),
    ).toThrow();
  });
});

describe("source diagnostic contract", () => {
  it("retains error codes, operations and validated locations, deriving messages from the catalogue", async () => {
    const record = {
      event: "http_request",
      errorCode: "HH_UNEXPECTED",
      operation: "documents.storage_read",
      locations: ["apps/api/src/app.ts:1:1"],
      diagnosticMessage: "PRIVATE_DIAGNOSTIC_TEXT",
    };
    const { reader, fetcher } = fixture(body([JSON.stringify(record)]));
    const result = await reader.search({
      ...input,
      errorCode: "HH_UNEXPECTED",
      operation: "documents.storage_read",
    });
    expect(result.entries[0]?.record).toMatchObject({
      errorCode: "HH_UNEXPECTED",
      operation: "documents.storage_read",
      locations: record.locations,
      diagnosticMessage:
        "An unexpected application error interrupted this operation.",
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_DIAGNOSTIC_TEXT");
    expect(decodeURIComponent(String(fetcher.mock.calls[0]?.[0]))).toContain(
      'errorCode="HH_UNEXPECTED"',
    );
  });
  it("rejects unregistered codes, operations and private/invalid source locations", async () => {
    for (const extra of [
      { errorCode: "PRIVATE" },
      { operation: "private.name" },
      { locations: ["/home/private/secret.ts:1:1"] },
      { locations: ["apps/api/src/app.ts:999999:1"] },
    ]) {
      await expect(
        fixture(
          body([JSON.stringify({ event: "http_request", ...extra })]),
        ).reader.search(input),
      ).rejects.toThrow("Unexpected log record");
    }
  });
});

describe("agent protocol and audit", () => {
  it("exposes only the read-only search tool over the actual MCP protocol", async () => {
    const server = createLogsServer(fixture().reader);
    const client = new Client({ name: "verification-agent", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(["search_logs"]);
      expect(tools[0]?.annotations?.readOnlyHint).toBe(true);
      const result = await client.callTool({
        name: "search_logs",
        arguments: input,
      });
      expect(JSON.stringify(result)).toContain("loki:");
      expect(JSON.stringify(result)).not.toContain(config.token);
      expect(
        (await client.callTool({ name: "deploy", arguments: {} })).isError,
      ).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });
  it("writes private bounded audit files and rotates without retaining query text", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hh-log-audit-"));
    try {
      const file = join(dir, "query.jsonl"),
        audit = fileAudit(file);
      await new LogsReader(
        config,
        audit,
        async () => response(body()),
        () => now,
      ).search({ ...input, contains: "PRIVATE SEARCH" });
      expect(await readFile(file, "utf8")).not.toContain("PRIVATE SEARCH");
      await writeFile(file, "x".repeat(1024 * 1024), { mode: 0o600 });
      await new LogsReader(
        config,
        audit,
        async () => response(body()),
        () => now,
      ).search(input);
      expect((await readFile(`${file}.1`)).length).toBe(1024 * 1024);
      await chmod(file, 0o644);
      await expect(
        new LogsReader(
          config,
          audit,
          async () => response(body()),
          () => now,
        ).search(input),
      ).rejects.toThrow("audit failure");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("serializes concurrent audits across readers sharing the same private file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hh-log-audit-"));
    try {
      const file = join(dir, "query.jsonl");
      const a = new LogsReader(
        config,
        fileAudit(file),
        async () => response(body()),
        () => now,
      );
      const b = new LogsReader(
        config,
        fileAudit(file),
        async () => response(body()),
        () => now,
      );
      await Promise.all([a.search(input), b.search(input)]);
      const records = (await readFile(file, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(
        records.filter((record) => record.phase === "completed"),
      ).toHaveLength(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("refuses symlink audit targets", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hh-log-audit-"));
    try {
      const target = join(dir, "other");
      await writeFile(target, "untouched", { mode: 0o600 });
      await symlink(target, join(dir, "query.jsonl"));
      await expect(
        new LogsReader(
          config,
          fileAudit(join(dir, "query.jsonl")),
          async () => response(body()),
          () => now,
        ).search(input),
      ).rejects.toThrow();
      expect(await readFile(target, "utf8")).toBe("untouched");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
