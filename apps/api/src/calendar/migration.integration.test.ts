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
describe.runIf(Boolean(url))("calendar pictures migration", () => {
  it("upgrades populated 0054 data and repeats without changing calendar entries or existing media", async () => {
    if (!url || !new URL(url).pathname.startsWith("/home_hub_test_")) {
      throw Error("Disposable home_hub_test_ database required");
    }
    const name = `home_hub_test_calendar_pictures_${randomUUID().replaceAll("-", "")}`;
    const directory = await mkdtemp(
      join(tmpdir(), "hh-calendar-pictures-migration-"),
    );
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
      const entries = journal.entries.filter((entry) => entry.idx <= 54);
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
      const item = randomUUID();
      const asset = randomUUID();
      await db.execute(
        sql`INSERT INTO households(id,name) VALUES (${household},'Fixture')`,
      );
      await db.execute(
        sql`INSERT INTO calendar_items(id,household_id,day,title,note,sort_key) VALUES (${item},${household},'2026-11-12','Dinner','Keep this note',-1024)`,
      );
      await db.execute(
        sql`INSERT INTO media(id,household_id,kind,object_key,content_type,byte_size,width,height) VALUES (${asset},${household},'image',${`households/${household}/media/${asset}`},'image/png',42,640,480)`,
      );
      const before = (
        await db.execute(
          sql`SELECT to_jsonb(t) value FROM calendar_items t WHERE id=${item}`,
        )
      ).rows;
      const mediaBefore = (
        await db.execute(
          sql`SELECT to_jsonb(t) value FROM media t WHERE id=${asset}`,
        )
      ).rows;
      await migrate(db, { migrationsFolder: source });
      await db.execute(
        sql`INSERT INTO calendar_media(id,household_id,item_id,media_id,sort_key) VALUES (${randomUUID()},${household},${item},${asset},0)`,
      );
      await migrate(db, { migrationsFolder: source });
      expect(
        (
          await db.execute(
            sql`SELECT to_jsonb(t) value FROM calendar_items t WHERE id=${item}`,
          )
        ).rows,
      ).toEqual(before);
      expect(
        (
          await db.execute(
            sql`SELECT to_jsonb(t) value FROM media t WHERE id=${asset}`,
          )
        ).rows,
      ).toEqual(mediaBefore);
      expect(
        (await db.execute(sql`SELECT count(*)::int count FROM calendar_media`))
          .rows,
      ).toEqual([{ count: 1 }]);
      expect(
        (
          await db.execute(
            sql`SELECT tablename FROM pg_publication_tables WHERE pubname='home_hub_zero' AND tablename='calendar_media'`,
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        (
          await db.execute(
            sql`SELECT attnames FROM pg_publication_tables WHERE pubname='home_hub_zero' AND tablename='media'`,
          )
        ).rows[0]?.attnames,
      ).not.toContain("object_key");
    } finally {
      await client?.close();
      // Let the pool's closing sockets finish instead of SIGTERM-ing them while
      // node-postgres is still processing shutdown, which can emit an idle error.
      await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS "${name}"`));
      await admin.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
