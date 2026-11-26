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

describe.runIf(Boolean(url))("calendar range migration", () => {
  it("preserves populated single-day items and labels, publishes the additive column and enforces valid ranges", async () => {
    if (!url || !new URL(url).pathname.startsWith("/home_hub_test_")) {
      throw Error("Disposable home_hub_test_ database required");
    }
    const name = `home_hub_test_calendar_range_${randomUUID().replaceAll("-", "")}`;
    const directory = await mkdtemp(join(tmpdir(), "hh-calendar-range-"));
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
      const entries = journal.entries.filter((entry) => entry.idx <= 58);
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
      const person = randomUUID();
      const id = randomUUID();
      const deleted = randomUUID();
      await db.execute(
        sql`INSERT INTO households(id,name) VALUES (${household},'Range fixture')`,
      );
      await db.execute(
        sql`INSERT INTO users(id,username,email,password_hash) VALUES (${person},${person},${`${person}@example.invalid`},'fixture')`,
      );
      await db.execute(sql`INSERT INTO calendar_items(id,household_id,day,title,note,sort_key,deleted_at) VALUES
        (${id},${household},'2026-11-30','Existing item','Keep my note',42,NULL),
        (${deleted},${household},'2024-02-29','Deleted item','Retained tombstone',-42,now())`);
      await db.execute(
        sql`INSERT INTO calendar_people(item_id,household_id,user_id) VALUES (${id},${household},${person})`,
      );
      const before = (
        await db.execute(
          sql`SELECT to_jsonb(t) value FROM calendar_items t ORDER BY id`,
        )
      ).rows;
      const people = (await db.execute(sql`SELECT * FROM calendar_people`))
        .rows;
      await migrate(db, { migrationsFolder: source });
      await migrate(db, { migrationsFolder: source });
      expect(
        (
          await db.execute(
            sql`SELECT to_jsonb(t) - 'end_day' value FROM calendar_items t ORDER BY id`,
          )
        ).rows,
      ).toEqual(before);
      expect(
        (await db.execute(sql`SELECT * FROM calendar_people`)).rows,
      ).toEqual(people);
      expect(
        (await db.execute(sql`SELECT end_day FROM calendar_items`)).rows,
      ).toEqual([{ end_day: null }, { end_day: null }]);
      const publication = (
        await db.execute(
          sql`SELECT attnames FROM pg_publication_tables WHERE pubname='home_hub_zero' AND tablename='calendar_items'`,
        )
      ).rows[0];
      expect(publication?.attnames).toContain("end_day");
      for (const end of [
        "2026-11-29",
        "2026-02-30",
        "0000-01-01",
        "2026-12-01T10:00:00Z",
      ]) {
        await expect(
          db.execute(
            sql`UPDATE calendar_items SET end_day=${end} WHERE id=${id}`,
          ),
        ).rejects.toThrow();
      }
      await db.execute(
        sql`UPDATE calendar_items SET end_day='9999-12-31' WHERE id=${id}`,
      );
      await expect(
        db.execute(
          sql`UPDATE calendar_items SET day='9999-12-31',end_day='9999-12-30' WHERE id=${id}`,
        ),
      ).rejects.toThrow();
      await db.execute(
        sql`UPDATE calendar_items SET end_day=NULL WHERE id=${id}`,
      );
    } finally {
      await client?.close();
      await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS "${name}"`));
      await admin.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
