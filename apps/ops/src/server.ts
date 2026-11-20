import { homedir } from "node:os";
import { join } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileAudit } from "./audit.ts";
import { LogsReader, loadLogsConfig } from "./logs.ts";
import { createLogsServer } from "./mcp.ts";

try {
  const reader = new LogsReader(
    loadLogsConfig(process.env),
    fileAudit(
      process.env.HOME_HUB_LOG_AUDIT_FILE ??
        join(homedir(), ".cache/home-hub/log-query-audit/queries.jsonl"),
    ),
  );
  await createLogsServer(reader).connect(new StdioServerTransport());
} catch {
  // stdout belongs exclusively to MCP; configuration may contain credentials.
  console.error(
    "Home Hub logs gateway could not start. Check private configuration and audit permissions.",
  );
  process.exitCode = 1;
}
