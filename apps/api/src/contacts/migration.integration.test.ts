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
describe.runIf(Boolean(url))("Contacts destructive cutover", () => {
  it("fails closed with populated Logs, then removes only approved legacy data and repeats safely", async () => {
    if (!url || !new URL(url).pathname.startsWith("/home_hub_test_")) {
      throw Error("Disposable database required");
    }
    const name = "home_hub_test_contacts_" + randomUUID().replaceAll("-", "");
    const directory = await mkdtemp(join(tmpdir(), "hh-contacts-cutover-"));
    const admin = createDbClient(url);
    let client: ReturnType<typeof createDbClient> | undefined;
    try {
      await admin.db.execute(sql.raw('CREATE DATABASE "' + name + '"'));
      const database = new URL(url);
      database.pathname = "/" + name;
      client = createDbClient(database.href);
      const db = client.db;
      const journal = JSON.parse(
        await readFile(join(source, "meta/_journal.json"), "utf8"),
      ) as { entries: { idx: number; tag: string }[] };
      const entries = journal.entries.filter((e) => e.idx <= 56);
      await mkdir(join(directory, "meta"));
      await writeFile(
        join(directory, "meta/_journal.json"),
        JSON.stringify({ ...journal, entries }),
      );
      for (const e of entries) {
        await copyFile(
          join(source, e.tag + ".sql"),
          join(directory, e.tag + ".sql"),
        );
      }
      await migrate(db, { migrationsFolder: directory });
      const h = randomUUID();
      const user = randomUUID();
      const log = randomUUID();
      const entry = randomUUID();
      const list = randomUUID();
      await db.execute(
        sql`INSERT INTO users(id,email,username,password_hash) VALUES (${user},${user + "@example.invalid"},${user},'fixture')`,
      );
      await db.execute(
        sql`INSERT INTO households(id,name) VALUES (${h},'Preserve household')`,
      );
      await db.execute(
        sql`INSERT INTO household_module_settings(household_id,module_key,enabled) VALUES (${h},'logs',true)`,
      );
      await db.execute(
        sql`INSERT INTO lists(id,household_id,name,normalized_name,kind,sort_key) VALUES (${list},${h},'Keep list','keep list','checklist',3)`,
      );
      await db.execute(
        sql`INSERT INTO logs(id,household_id,title,normalized_title) VALUES (${log},${h},'Discard topic','discard topic')`,
      );
      await db.execute(
        sql`INSERT INTO log_entries(id,household_id,log_id,entry_on,note,created_by,last_edited_by,last_write_id) VALUES (${entry},${h},${log},'2026-11-24','Discard this legacy note',${user},${user},${randomUUID()})`,
      );
      const before = (
        await db.execute(
          sql`SELECT to_jsonb(t) value FROM lists t WHERE id=${list}`,
        )
      ).rows;
      await expect(migrate(db, { migrationsFolder: source })).rejects.toThrow(
        /cutover|acknowledgement/i,
      );
      expect(
        (await db.execute(sql`SELECT count(*)::int n FROM log_entries`)).rows,
      ).toEqual([{ n: 1 }]);
      expect(
        (await db.execute(sql`SELECT to_regclass('contacts') AS value`)).rows,
      ).toEqual([{ value: null }]);
      await client.close();
      database.searchParams.set(
        "options",
        "-c home_hub.contacts_cutover_ready=1",
      );
      client = createDbClient(database.href);
      await migrate(client.db, { migrationsFolder: source });
      await migrate(client.db, { migrationsFolder: source });
      for (const table of ["logs", "log_entries", "log_categories"]) {
        expect(
          (await client.db.execute(sql`SELECT to_regclass(${table}) value`))
            .rows,
        ).toEqual([{ value: null }]);
      }
      expect(
        (
          await client.db.execute(
            sql`SELECT to_regprocedure('refresh_log_last_entry()') value`,
          )
        ).rows,
      ).toEqual([{ value: null }]);
      expect(
        (
          await client.db.execute(
            sql`SELECT to_jsonb(t) value FROM lists t WHERE id=${list}`,
          )
        ).rows,
      ).toEqual(before);
      expect(
        (
          await client.db.execute(
            sql`SELECT module_key,enabled FROM household_module_settings WHERE household_id=${h}`,
          )
        ).rows,
      ).toEqual([{ module_key: "contacts", enabled: true }]);
      expect(
        (await client.db.execute(sql`SELECT count(*)::int n FROM contacts`))
          .rows,
      ).toEqual([{ n: 0 }]);
      expect(
        (
          await client.db.execute(
            sql`SELECT tablename FROM pg_publication_tables WHERE pubname='home_hub_zero' AND tablename LIKE 'contact%'`,
          )
        ).rows,
      ).toHaveLength(4);
      // Database-level invariants also apply to administrative/temporary scripts.
      const person = randomUUID();
      await client.db.execute(
        sql`INSERT INTO contacts(id,household_id,name,normalized_name,search_text,last_write_id,last_write_hash) VALUES (${person},${h},'Person','person','Person',${randomUUID()},'fixture')`,
      );
      await expect(
        client.db.execute(
          sql`INSERT INTO contact_entries(id,household_id,entry_on,created_by,last_edited_by,last_write_id,last_write_hash) VALUES (${randomUUID()},${h},'2026-11-24',${user},${user},${randomUUID()},'fixture')`,
        ),
      ).rejects.toThrow();
      const staged = randomUUID();
      await client.db.transaction(async (tx) => {
        await tx.execute(
          sql`INSERT INTO contact_entries(id,household_id,entry_on,note,created_by,last_edited_by,last_write_id,last_write_hash) VALUES (${staged},${h},'2026-11-24',${" \n\t"},${user},${user},${randomUUID()},'fixture')`,
        );
        await tx.execute(
          sql`INSERT INTO contact_entry_people(household_id,entry_id,contact_id) VALUES (${h},${staged},${person})`,
        );
      });
      await expect(
        client.db.execute(
          sql`UPDATE contact_entries SET published=true WHERE id=${staged}`,
        ),
      ).rejects.toThrow();
    } finally {
      await client?.close();
      await admin.db.execute(sql.raw('DROP DATABASE IF EXISTS "' + name + '"'));
      await admin.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
