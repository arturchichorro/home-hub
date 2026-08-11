import type { Database } from "@home-hub/database";
import { sql } from "drizzle-orm";

export type ReadinessCheck = () => Promise<void>;

export function createDatabaseReadinessCheck({
  db,
}: {
  db: Database;
}): ReadinessCheck {
  return async function checkDatabaseReadiness() {
    await db.execute(sql`select 1`);
  };
}
