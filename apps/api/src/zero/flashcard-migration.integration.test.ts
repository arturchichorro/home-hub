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
describe.runIf(Boolean(url))("flashcard migration", () => {
  it("upgrades populated 0055 lists and media without rewriting content and repeats safely", async () => {
    if (!url || !new URL(url).pathname.startsWith("/home_hub_test_")) {
      throw Error("Disposable home_hub_test_ database required");
    }
    const name = `home_hub_test_flashcards_${randomUUID().replaceAll("-", "")}`;
    const directory = await mkdtemp(join(tmpdir(), "hh-flashcards-migration-"));
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
      const entries = journal.entries.filter((entry) => entry.idx <= 55);
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
      const checklist = randomUUID();
      const board = randomUUID();
      const item = randomUUID();
      const asset = randomUUID();
      const attachment = randomUUID();
      await db.execute(
        sql`INSERT INTO households(id,name) VALUES (${household},'Fixture')`,
      );
      await db.execute(
        sql`INSERT INTO lists(id,household_id,name,normalized_name,kind,media_count,sort_key) VALUES (${checklist},${household},'Shopping','shopping','checklist',0,10),(${board},${household},'Pictures','pictures','moodboard',1,-1024)`,
      );
      await db.execute(
        sql`INSERT INTO list_items(id,household_id,list_id,name,normalized_name,status,sort_key) VALUES (${item},${household},${checklist},'Keep this item','keep this item','archived',17)`,
      );
      await db.execute(
        sql`INSERT INTO media(id,household_id,kind,object_key,content_type,byte_size,width,height) VALUES (${asset},${household},'image',${`households/${household}/media/${asset}`},'image/png',42,640,480)`,
      );
      await db.execute(
        sql`INSERT INTO list_media(id,household_id,list_id,media_id,sort_key) VALUES (${attachment},${household},${board},${asset},8)`,
      );
      const readBefore = async () =>
        Promise.all(
          ["lists", "list_items", "media", "list_media"].map(
            async (table) =>
              (
                await db.execute(
                  sql.raw(
                    `SELECT to_jsonb(t) value FROM "${table}" t ORDER BY id`,
                  ),
                )
              ).rows,
          ),
        );
      const before = await readBefore();
      await migrate(db, { migrationsFolder: source });
      const deck = randomUUID();
      await db.execute(
        sql`INSERT INTO lists(id,household_id,name,normalized_name,kind,sort_key) VALUES (${deck},${household},'New deck','new deck','flashcards',20)`,
      );
      await db.execute(
        sql`INSERT INTO list_flashcards(id,household_id,list_id,front,back,sort_key) VALUES (${randomUUID()},${household},${deck},'Question','Answer',1)`,
      );
      await migrate(db, { migrationsFolder: source });
      const after = await readBefore();
      expect(
        after[0]?.filter((row) => (row.value as { id: string }).id !== deck),
      ).toEqual(before[0]);
      expect(after.slice(1)).toEqual(before.slice(1));
      expect(
        (await db.execute(sql`SELECT count(*)::int count FROM list_flashcards`))
          .rows,
      ).toEqual([{ count: 1 }]);
      expect(
        (
          await db.execute(
            sql`SELECT tablename FROM pg_publication_tables WHERE pubname='home_hub_zero' AND tablename='list_flashcards'`,
          )
        ).rows,
      ).toHaveLength(1);
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
