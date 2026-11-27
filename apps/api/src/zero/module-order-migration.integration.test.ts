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
describe.runIf(Boolean(url))("personal module order migration", () => {
  it("preserves existing memberships and ordering, defaults preferences and publishes the new column", async () => {
    if (!url || !new URL(url).pathname.startsWith("/home_hub_test_")) {
      throw Error("Disposable home_hub_test_ database required");
    }
    const name = `home_hub_test_module_order_${randomUUID().replaceAll("-", "")}`;
    const directory = await mkdtemp(join(tmpdir(), "hh-module-order-"));
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
      const entries = journal.entries.filter((entry) => entry.idx <= 59);
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
      await db.execute(
        sql`INSERT INTO users(id,username,email,password_hash) VALUES (${person},${person},${`${person}@example.invalid`},'fixture')`,
      );
      await db.execute(
        sql`INSERT INTO households(id,name) VALUES (${household},'Existing household')`,
      );
      await db.execute(
        sql`INSERT INTO household_members(id,household_id,user_id,role,sort_key) VALUES (${randomUUID()},${household},${person},'owner',42)`,
      );
      const before = (
        await db.execute(sql`SELECT to_jsonb(t) value FROM household_members t`)
      ).rows;
      const tables = (
        await db.execute(
          sql`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
        )
      ).rows;
      // Rehearse this migration only, not unrelated later schema changes.
      const target = journal.entries.find((entry) => entry.idx === 60);
      if (!target) {
        throw Error("Missing module order migration");
      }
      await copyFile(
        join(source, `${target.tag}.sql`),
        join(directory, `${target.tag}.sql`),
      );
      await writeFile(
        join(directory, "meta/_journal.json"),
        JSON.stringify({ ...journal, entries: [...entries, target] }),
      );
      await migrate(db, { migrationsFolder: directory });
      await migrate(db, { migrationsFolder: directory });
      expect(
        (
          await db.execute(
            sql`SELECT to_jsonb(t) - 'module_order' value FROM household_members t`,
          )
        ).rows,
      ).toEqual(before);
      expect(
        (await db.execute(sql`SELECT module_order FROM household_members`))
          .rows,
      ).toEqual([{ module_order: [] }]);
      expect(
        (
          await db.execute(
            sql`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
          )
        ).rows,
      ).toEqual(tables);
      const publication = (
        await db.execute(
          sql`SELECT attnames::text[] AS attnames FROM pg_publication_tables WHERE pubname='home_hub_zero' AND tablename='household_members'`,
        )
      ).rows[0];
      expect(publication?.attnames).toEqual(
        expect.arrayContaining([
          "id",
          "household_id",
          "user_id",
          "role",
          "sort_key",
          "module_order",
          "created_at",
          "updated_at",
        ]),
      );
      await expect(
        db.execute(sql`UPDATE household_members SET module_order='{}'::jsonb`),
      ).rejects.toThrow();
      await expect(
        db.execute(sql`UPDATE household_members SET module_order=NULL`),
      ).rejects.toThrow();
    } finally {
      await client?.close();
      await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS "${name}"`));
      await admin.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
