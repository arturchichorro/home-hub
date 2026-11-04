import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LogSearchError, type LogsReader, searchSchema } from "./logs.ts";

export function createLogsServer(reader: LogsReader) {
  const server = new McpServer({ name: "home-hub-logs", version: "1.0.0" });
  server.registerTool(
    "search_logs",
    {
      description:
        "Search privacy-projected Home Hub production logs. Read-only, 14-day lookback, 6-hour maximum window, 200 entries maximum. Cite entry.citation and source; inspect truncated/coverage before drawing conclusions. No raw LogQL, SQL, shell or deployment access.",
      inputSchema: searchSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true,
      },
    },
    async (input) => {
      try {
        return {
          content: [
            { type: "text", text: JSON.stringify(await reader.search(input)) },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                error instanceof LogSearchError
                  ? error.message
                  : "Log search unavailable.",
            },
          ],
        };
      }
    },
  );
  return server;
}
