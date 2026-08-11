import type { Database } from "@home-hub/database";
import { schema } from "@home-hub/shared/zero/schema";
import { zeroDrizzle } from "@rocicorp/zero/server/adapters/drizzle";

export function createZeroDbProvider({ db }: { db: Database }) {
  return zeroDrizzle(schema, db);
}

export type ZeroDbProvider = ReturnType<typeof createZeroDbProvider>;
