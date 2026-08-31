import type { ExtractTablesWithRelations } from "drizzle-orm";
import {
  drizzle,
  type NodePgDatabase,
  type NodePgTransaction,
} from "drizzle-orm/node-postgres";
import { type Pool as PgPool, Pool } from "pg";
import { withPublicSearchPath } from "./connection-url";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema> & { $client: PgPool };

export type DatabaseTransaction = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export function createDbClient(databaseUrl: string) {
  const pool = new Pool({
    connectionString: withPublicSearchPath(databaseUrl),
  });

  const db = drizzle({ client: pool, schema });

  return { db, close: () => pool.end() };
}
