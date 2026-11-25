import { createDbClient } from "@home-hub/database/client";
import * as schema from "@home-hub/database/schema";
import { getTableName, isTable, sql, type Table } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(url))("application schema cleanup", () => {
  let client: ReturnType<typeof createDbClient>;
  beforeAll(() => {
    if (!url || !new URL(url).pathname.startsWith("/home_hub_test_")) {
      throw Error("Owned disposable database required");
    }
    client = createDbClient(url);
  });
  afterAll(async () => {
    await client?.close();
  });

  it("has exactly the declared public tables, without legacy logging or abandoned statistics tables", async () => {
    const declared = Object.values(schema)
      .flatMap((value) =>
        isTable(value) ? [getTableName(value as Table)] : [],
      )
      .sort();
    const actual = (
      await client.db.execute<{ name: string }>(
        sql`SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
      )
    ).rows.map((row) => row.name);
    expect(actual).toEqual(declared);
    for (const name of [
      "exercise_statistics",
      "habit_weekly_statistics",
      "logs",
      "log_entries",
      "log_categories",
      "workout_logs",
      "workout_log_exercises",
      "workout_log_sets",
      "exercise_logs",
      "exercise_log_sets",
    ]) {
      expect(actual).not.toContain(name);
    }
  });
  it("has no abandoned statistics functions or unused public enums, and keeps live Contacts constraints", async () => {
    const abandoned = (
      await client.db.execute(sql`
      SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('refresh_exercise_statistics','refresh_habit_weekly_statistics','refresh_log_last_entry')
    `)
    ).rows;
    expect(abandoned).toEqual([]);
    const unusedEnums = (
      await client.db.execute(sql`
      SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='public' AND t.typtype='e' AND NOT EXISTS (
        SELECT 1 FROM pg_attribute a WHERE a.atttypid IN (t.oid,t.typarray) AND NOT a.attisdropped
      )
    `)
    ).rows;
    expect(unusedEnums).toEqual([]);
    const constraints = (
      await client.db.execute(sql`
      SELECT t.tgname FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='check_contact_entry_people' AND NOT t.tgisinternal
    `)
    ).rows;
    expect(constraints.length).toBeGreaterThan(0);
  });
});
