import type { createDbClient } from "@home-hub/database/client";
import { schema } from "@home-hub/shared/zero/schema";
import { zeroDrizzle } from "@rocicorp/zero/server/adapters/drizzle";

type Database = ReturnType<typeof createDbClient>["db"];

export function createZeroDbProvider({ db }: { db: Database }) {
  return zeroDrizzle(schema, db);
}

export type ZeroDbProvider = ReturnType<typeof createZeroDbProvider>;
