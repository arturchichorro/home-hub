import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, it } from "vitest";

it("starts the documented native-Node stdio entrypoint with only the read tool, without querying Cloud", async () => {
  const client = new Client({ name: "stdio-fixture", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("./server.ts", import.meta.url))],
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "/tmp",
      HOME_HUB_LOKI_URL: "https://logs-fixture.grafana.net",
      HOME_HUB_LOKI_TENANT: "1",
      HOME_HUB_LOKI_READ_TOKEN: "fixture-read-only-token",
    },
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const result = await client.listTools();
    expect(result.tools.map((tool) => tool.name)).toEqual(["search_logs"]);
    expect(result.tools[0]?.annotations?.readOnlyHint).toBe(true);
    expect(result.tools[0]?.annotations?.destructiveHint).toBe(false);
  } finally {
    await client.close();
  }
});
