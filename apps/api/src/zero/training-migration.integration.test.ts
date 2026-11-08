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

const databaseUrl = process.env.TEST_DATABASE_URL;
const migrations = fileURLToPath(
  new URL("../../../../packages/database/drizzle/", import.meta.url),
);

describe.runIf(Boolean(databaseUrl))(
  "populated canonical training cutover",
  () => {
    it("fails safely on orphan data, then migrates every current value and drops legacy tables without replaying the stale archive", async () => {
      if (
        !databaseUrl ||
        !new URL(databaseUrl).pathname.startsWith("/home_hub_test_")
      ) {
        throw Error("Disposable home_hub_test_ database required");
      }

      const name = `home_hub_test_training_${randomUUID().replaceAll("-", "")}`;
      const directory = await mkdtemp(
        join(tmpdir(), "home-hub-training-migration-"),
      );
      const admin = createDbClient(databaseUrl);
      let client: ReturnType<typeof createDbClient> | undefined;

      try {
        await admin.db.execute(sql.raw(`CREATE DATABASE "${name}"`));
        const url = new URL(databaseUrl);
        url.pathname = `/${name}`;
        client = createDbClient(url.href);
        const db = client.db;
        const journal = JSON.parse(
          await readFile(join(migrations, "meta/_journal.json"), "utf8"),
        ) as { entries: { idx: number; tag: string }[] };
        const entries = journal.entries.filter((entry) => entry.idx < 53);
        await mkdir(join(directory, "meta"));
        await writeFile(
          join(directory, "meta/_journal.json"),
          JSON.stringify({ ...journal, entries }),
        );

        for (const entry of entries) {
          await copyFile(
            join(migrations, `${entry.tag}.sql`),
            join(directory, `${entry.tag}.sql`),
          );
        }

        await migrate(db, { migrationsFolder: directory });
        const [
          household,
          author,
          workout,
          catalog,
          extraCatalog,
          missingCatalog,
          session,
          emptySession,
          occurrence,
          extraOccurrence,
          orphan,
          slot,
          repeatSlot,
          unusedSlot,
        ] = Array.from({ length: 14 }, () => randomUUID());
        const definition = {
          id: slot,
          catalogExerciseId: catalog,
          name: "Frozen name",
          unit: "reps",
          load: "bodyweight",
          unilateral: false,
          sets: 2,
          target: "8-12",
        };
        const extraDefinition = {
          ...definition,
          id: extraCatalog,
          catalogExerciseId: extraCatalog,
          name: "Extra frozen",
        };
        const snapshot = {
          title: "Frozen workout title",
          exercises: [
            definition,
            { ...definition, id: repeatSlot },
            {
              ...definition,
              id: unusedSlot,
              catalogExerciseId: missingCatalog,
              name: "Unperformed retired",
            },
          ],
        };
        await db.execute(
          sql`INSERT INTO users (id,username,email,password_hash) VALUES (${author}::uuid,${author},${`${author}@example.invalid`},'fixture')`,
        );
        await db.execute(
          sql`INSERT INTO households (id,name) VALUES (${household}::uuid,'Migration fixture')`,
        );
        await db.execute(
          sql`INSERT INTO workouts (id,household_id,title,notes) VALUES (${workout}::uuid,${household}::uuid,'Current title','Shared note')`,
        );

        for (const [id, label] of [
          [catalog, "Renamed catalog"],
          [extraCatalog, "Extra catalog"],
          [missingCatalog, "Retired catalog"],
        ]) {
          await db.execute(sql`INSERT INTO exercises (id,household_id,name,normalized_name,unit,load,unilateral,deleted_at)
          VALUES (${id}::uuid,${household}::uuid,${label},${label},'reps','bodyweight',false,now())`);
        }

        await db.execute(sql`INSERT INTO workout_logs (id,household_id,user_id,workout_id,note,snapshot,exercise_roles,completed_on,completed_at,created_at)
        VALUES (${session}::uuid,${household}::uuid,${author}::uuid,${workout}::uuid,'Private historical note',${JSON.stringify(snapshot)}::jsonb,
        ${JSON.stringify({ [slot as string]: "warmup", [repeatSlot as string]: "stretching" })}::jsonb,'2026-10-10','2026-10-10T12:00:00Z','2026-10-09T12:00:00Z')`);
        await db.execute(sql`INSERT INTO workout_logs (id,household_id,user_id,workout_id,note,snapshot,completed_on,completed_at)
        VALUES (${emptySession}::uuid,${household}::uuid,${author}::uuid,${workout}::uuid,'Note only',${JSON.stringify({ title: "Empty log", exercises: [] })}::jsonb,'2026-10-11','2026-10-11T12:00:00Z')`);

        for (const [id, catalogId, frozen] of [
          [occurrence, catalog, definition],
          [extraOccurrence, extraCatalog, extraDefinition],
          [orphan, catalog, definition],
        ] as const) {
          await db.execute(sql`INSERT INTO exercise_logs (id,household_id,user_id,exercise_id,performed_on,performed_at,snapshot)
          VALUES (${id}::uuid,${household}::uuid,${author}::uuid,${catalogId}::uuid,'2026-10-09','2026-10-09T23:59:00Z',${JSON.stringify(frozen)}::jsonb)`);
        }

        await db.execute(sql`INSERT INTO workout_log_exercises (workout_log_id,workout_exercise_id,exercise_log_id,household_id,user_id,position)
        VALUES (${session}::uuid,${slot}::uuid,${occurrence}::uuid,${household}::uuid,${author}::uuid,0),
        (${session}::uuid,${extraCatalog}::uuid,${extraOccurrence}::uuid,${household}::uuid,${author}::uuid,3)`);
        await db.execute(sql`INSERT INTO exercise_log_sets (exercise_log_id,round,amount,right_amount,weight_kg,unit,load,unilateral)
        VALUES (${occurrence}::uuid,1,12,NULL,NULL,'seconds','bodyweight',true),
        (${extraOccurrence}::uuid,3,0,0,12.75,'reps','per-hand',true)`);
        await db.execute(sql`INSERT INTO workout_log_sets (log_id,household_id,workout_exercise_id,exercise_id,round,amount,unit,load,unilateral)
        VALUES (${session}::uuid,${household}::uuid,${slot}::uuid,${catalog}::uuid,1,3,'reps','bodyweight',false)`);

        await expect(
          migrate(db, { migrationsFolder: migrations }),
        ).rejects.toThrow();
        expect(
          (
            await db.execute(
              sql`SELECT count(*)::int AS count FROM workout_logs`,
            )
          ).rows[0],
        ).toMatchObject({ count: 2 });
        expect(
          (
            await db.execute(
              sql`SELECT to_regclass('public.training_sessions') AS table_name`,
            )
          ).rows[0],
        ).toMatchObject({ table_name: null });
        await db.execute(
          sql`DELETE FROM exercise_logs WHERE id=${orphan}::uuid`,
        );

        for (const invalid of [
          { ...snapshot, exercises: [...snapshot.exercises, definition] },
          {
            ...snapshot,
            exercises: snapshot.exercises.map((row) =>
              row.id === slot
                ? { ...row, name: "Conflicting frozen name" }
                : row,
            ),
          },
        ]) {
          await db.execute(
            sql`UPDATE workout_logs SET snapshot=${JSON.stringify(invalid)}::jsonb WHERE id=${session}::uuid`,
          );
          await expect(
            migrate(db, { migrationsFolder: migrations }),
          ).rejects.toThrow();
          expect(
            (
              await db.execute(
                sql`SELECT to_regclass('public.training_sessions') AS table_name`,
              )
            ).rows[0],
          ).toMatchObject({ table_name: null });
        }
        await db.execute(
          sql`UPDATE workout_logs SET snapshot=${JSON.stringify(snapshot)}::jsonb WHERE id=${session}::uuid`,
        );
        await db.execute(
          sql`UPDATE workout_log_exercises SET position=1 WHERE exercise_log_id=${occurrence}::uuid`,
        );
        await expect(
          migrate(db, { migrationsFolder: migrations }),
        ).rejects.toThrow();
        await db.execute(
          sql`UPDATE workout_log_exercises SET position=0 WHERE exercise_log_id=${occurrence}::uuid`,
        );

        await db.execute(
          sql`CREATE TABLE external_training_reference (log_id uuid REFERENCES workout_logs(id))`,
        );
        await expect(
          migrate(db, { migrationsFolder: migrations }),
        ).rejects.toThrow();
        expect(
          (
            await db.execute(
              sql`SELECT count(*)::int AS count FROM workout_logs`,
            )
          ).rows[0],
        ).toMatchObject({ count: 2 });
        expect(
          (
            await db.execute(
              sql`SELECT to_regclass('public.training_sessions') AS table_name`,
            )
          ).rows[0],
        ).toMatchObject({ table_name: null });
        await db.execute(sql`DROP TABLE external_training_reference`);

        const tables = (
          await db.execute(
            sql`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
          )
        ).rows.map((row) => String(row.tablename));
        const retired = new Set([
          "workout_logs",
          "workout_log_exercises",
          "workout_log_sets",
          "exercise_logs",
          "exercise_log_sets",
        ]);
        const before = new Map<string, unknown>();

        for (const table of tables) {
          if (!/^[a-z_]+$/.test(table)) {
            throw Error("Unexpected fixture table");
          }
          before.set(
            table,
            (
              await db.execute(
                sql.raw(
                  `SELECT to_jsonb(t) AS value FROM public."${table}" t ORDER BY to_jsonb(t)::text`,
                ),
              )
            ).rows,
          );
        }

        await migrate(db, { migrationsFolder: migrations });
        await migrate(db, { migrationsFolder: migrations });

        for (const table of tables) {
          if (retired.has(table)) {
            expect(
              (
                await db.execute(
                  sql`SELECT to_regclass(${`public.${table}`}) AS table_name`,
                )
              ).rows[0],
            ).toMatchObject({ table_name: null });
            continue;
          }
          expect(
            (
              await db.execute(
                sql.raw(
                  `SELECT to_jsonb(t) AS value FROM public."${table}" t ORDER BY to_jsonb(t)::text`,
                ),
              )
            ).rows,
          ).toEqual(before.get(table));
        }

        const headers = (
          await db.execute(
            sql`SELECT id,name,note,completed_on FROM training_sessions ORDER BY completed_on`,
          )
        ).rows;
        expect(headers).toEqual([
          {
            id: session,
            name: "Frozen workout title",
            note: "Private historical note",
            completed_on: "2026-10-10",
          },
          {
            id: emptySession,
            name: "Empty log",
            note: "Note only",
            completed_on: "2026-10-11",
          },
        ]);
        const rows = (
          await db.execute(
            sql`SELECT id,template_exercise_id,exercise_id,name,role,performed_on,planned_sets,target,position FROM training_session_exercises ORDER BY position`,
          )
        ).rows;
        expect(rows).toHaveLength(4);
        expect(rows[0]).toMatchObject({
          id: occurrence,
          name: "Frozen name",
          role: "warmup",
          performed_on: "2026-10-09",
        });
        expect(rows[1]).toMatchObject({
          template_exercise_id: repeatSlot,
          exercise_id: catalog,
          role: "stretching",
        });
        expect(rows[2]).toMatchObject({
          template_exercise_id: unusedSlot,
          name: "Unperformed retired",
          exercise_id: missingCatalog,
        });
        expect(rows[3]).toMatchObject({
          id: extraOccurrence,
          name: "Extra frozen",
          template_exercise_id: null,
          planned_sets: 2,
          target: "8-12",
          position: 3,
        });
        expect(
          (
            await db.execute(
              sql`SELECT session_exercise_id,round,amount,right_amount,weight_kg,unit,load,unilateral FROM training_session_sets ORDER BY amount`,
            )
          ).rows,
        ).toEqual([
          {
            session_exercise_id: extraOccurrence,
            round: 3,
            amount: 0,
            right_amount: 0,
            weight_kg: "12.75",
            unit: "reps",
            load: "per-hand",
            unilateral: true,
          },
          {
            session_exercise_id: occurrence,
            round: 1,
            amount: 12,
            right_amount: null,
            weight_kg: null,
            unit: "seconds",
            load: "bodyweight",
            unilateral: true,
          },
        ]);
        expect(
          (
            await db.execute(
              sql`SELECT to_regnamespace('training_archive') AS schema_name`,
            )
          ).rows[0],
        ).toMatchObject({ schema_name: null });
        const published = (
          await db.execute(
            sql`SELECT schemaname,tablename FROM pg_publication_tables WHERE pubname='home_hub_zero'`,
          )
        ).rows;
        expect(
          published.filter(
            (row) =>
              retired.has(String(row.tablename)) ||
              row.schemaname === "training_archive",
          ),
        ).toEqual([]);
        expect(
          published
            .filter((row) => String(row.tablename).startsWith("training_"))
            .map((row) => row.tablename)
            .sort(),
        ).toEqual([
          "training_session_exercises",
          "training_session_sets",
          "training_sessions",
        ]);
      } finally {
        await client?.close();
        await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS "${name}"`));
        await admin.close();
        await rm(directory, { recursive: true, force: true });
      }
    }, 30000);
  },
);
