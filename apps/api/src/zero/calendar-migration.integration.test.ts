import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDbClient } from "@home-hub/database/client";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const source = fileURLToPath(
  new URL("../../../../packages/database/drizzle/", import.meta.url),
);
describe.runIf(Boolean(url))("calendar migration", () => {
  it("upgrades populated 0053 data, backfills disabled settings and repeats without rewriting existing data", async () => {
    if (!url || !new URL(url).pathname.startsWith("/home_hub_test_")) {
      throw Error("Disposable home_hub_test_ database required");
    }
    const name = `home_hub_test_calendar_${randomUUID().replaceAll("-", "")}`;
    const directory = await mkdtemp(join(tmpdir(), "hh-calendar-migration-"));
    const admin = createDbClient(url);
    let client: ReturnType<typeof createDbClient> | undefined;
    try {
      await admin.db.execute(sql.raw(`CREATE DATABASE "${name}"`));
      const database = new URL(url);
      database.pathname = `/${name}`;
      client = createDbClient(database.href);
      const db = client.db;
      const journal = JSON.parse(
        await readFile(join(source, "meta/_journal.json"), "utf8"),
      ) as { entries: { idx: number; tag: string }[] };
      const entries = journal.entries.filter((entry) => entry.idx <= 53);
      await mkdir(join(directory, "meta"));
      await writeFile(
        join(directory, "meta/_journal.json"),
        JSON.stringify({ ...journal, entries }),
      );
      for (const entry of entries) {
        await copyFile(
          join(source, `${entry.tag}.sql`),
          join(directory, `${entry.tag}.sql`),
        );
      }
      await migrate(db, { migrationsFolder: directory });
      const household = randomUUID();
      const workout = randomUUID();
      await db.execute(
        sql`INSERT INTO households(id,name) VALUES (${household},'Existing household')`,
      );
      await db.execute(
        sql`INSERT INTO workouts(id,household_id,title,notes) VALUES (${workout},${household},'Existing title','Existing notes')`,
      );
      const before = (
        await db.execute(
          sql`SELECT to_jsonb(t) value FROM workouts t WHERE id=${workout}`,
        )
      ).rows;
      const hhBefore = (
        await db.execute(
          sql`SELECT to_jsonb(t) value FROM households t WHERE id=${household}`,
        )
      ).rows;
      await migrate(db, { migrationsFolder: source });
      await migrate(db, { migrationsFolder: source });
      expect(
        (
          await db.execute(
            sql`SELECT to_jsonb(t) value FROM workouts t WHERE id=${workout}`,
          )
        ).rows,
      ).toEqual(before);
      expect(
        (
          await db.execute(
            sql`SELECT to_jsonb(t) value FROM households t WHERE id=${household}`,
          )
        ).rows,
      ).toEqual(hhBefore);
      expect(
        (
          await db.execute(
            sql`SELECT enabled FROM household_module_settings WHERE household_id=${household} AND module_key='calendar'`,
          )
        ).rows,
      ).toEqual([{ enabled: false }]);
      expect(
        (await db.execute(sql`SELECT count(*)::int count FROM calendar_items`))
          .rows,
      ).toEqual([{ count: 0 }]);
      expect(
        (await db.execute(sql`SELECT count(*)::int count FROM calendar_people`))
          .rows,
      ).toEqual([{ count: 0 }]);
      expect(
        (
          await db.execute(
            sql`SELECT tablename FROM pg_publication_tables WHERE pubname='home_hub_zero' AND tablename IN ('calendar_items','calendar_people')`,
          )
        ).rows,
      ).toHaveLength(2);
    } finally {
      await client?.close();
      await admin.db.execute(
        sql.raw(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`),
      );
      await admin.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
