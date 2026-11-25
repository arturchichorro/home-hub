import type { Database, DatabaseTransaction } from "@home-hub/database";
import {
  calendarDate,
  calendarDateSchema,
  timeZoneSchema,
} from "@home-hub/shared/habits";
import { type SQL, sql } from "drizzle-orm";
import * as z from "zod";
import {
  type ActualSet,
  exerciseStatistics,
  habitStatistics,
} from "./calculate";

export const exportOptionsSchema = z
  .object({
    householdId: z.uuid(),
    trainingUser: z.string().min(1).optional(),
    from: calendarDateSchema.optional(),
    to: calendarDateSchema.optional(),
    timeZone: timeZoneSchema.default("UTC"),
  })
  .strict();

type Options = z.input<typeof exportOptionsSchema>;
type Write = (chunk: string) => Promise<void>;
type HabitRow = {
  habitId: string;
  name: string;
  status: string;
  userId: string;
  username: string;
  entryOn: string | null;
  completed: boolean | null;
  workoutCompleted: boolean | null;
};
type TrainingRow = ActualSet & {
  exerciseId: string;
  catalogName: string;
  retired: boolean;
  id: string;
  name: string;
  sessionId: string;
  workoutId: string | null;
  role: string;
  performedOn: string;
};

// Cursors keep supporting records out of memory. Names are fixed internal constants.
async function* rows<T extends Record<string, unknown>>(
  tx: DatabaseTransaction,
  name: "export_habits" | "export_training",
  query: SQL,
  checkBudget: () => void,
) {
  await tx.execute(sql`DECLARE ${sql.raw(name)} NO SCROLL CURSOR FOR ${query}`);

  try {
    while (true) {
      checkBudget();
      const batch = await tx.execute<T>(
        sql.raw(`FETCH FORWARD 500 FROM ${name}`),
      );

      for (const row of batch.rows) {
        yield row;
      }

      if (batch.rows.length < 500) {
        break;
      }
    }
  } finally {
    await tx.execute(sql.raw(`CLOSE ${name}`));
  }
}

async function writeHabits(
  tx: DatabaseTransaction,
  write: Write,
  householdId: string,
  from: string | undefined,
  to: string,
  checkBudget: () => void,
) {
  const start = from ? sql`AND e.entry_on >= ${from}` : sql``;
  let key: string | undefined;
  let firstRecord = true;
  let totals = habitStatistics(to);

  await write('{"status":"included","items":[');

  for await (const row of rows<HabitRow>(
    tx,
    "export_habits",
    sql`
    SELECT h.id AS "habitId",h.name,h.status,m.user_id AS "userId",u.username,
      e.entry_on AS "entryOn",e.completed,e.workout_completed AS "workoutCompleted"
    FROM habits h
    JOIN household_members m ON m.household_id=h.household_id
    JOIN users u ON u.id=m.user_id
    LEFT JOIN habit_entries e ON e.household_id=h.household_id AND e.habit_id=h.id
      AND e.user_id=m.user_id AND e.entry_on <= ${to} ${start}
    WHERE h.household_id=${householdId}::uuid
    ORDER BY h.id,m.user_id,e.entry_on
  `,
    checkBudget,
  )) {
    checkBudget();
    const next = `${row.habitId}:${row.userId}`;

    if (key !== next) {
      if (key !== undefined) {
        await write(`],"statistics":${JSON.stringify(totals.finish())}},`);
      }

      totals = habitStatistics(to);
      firstRecord = true;
      key = next;
      const header = {
        habit: { id: row.habitId, name: row.name, status: row.status },
        person: { id: row.userId, username: row.username },
      };
      await write(JSON.stringify(header).slice(0, -1) + ',"records":[');
    }

    if (row.entryOn !== null) {
      totals.add(row.entryOn, !!row.completed || !!row.workoutCompleted);
      await write(
        (firstRecord ? "" : ",") +
          JSON.stringify({
            entryOn: row.entryOn,
            completed: row.completed,
            workoutCompleted: row.workoutCompleted,
          }),
      );
      firstRecord = false;
    }
  }

  if (key !== undefined) {
    await write(`],"statistics":${JSON.stringify(totals.finish())}}`);
  }

  await write("]}");
}

async function writeTraining(
  tx: DatabaseTransaction,
  write: Write,
  householdId: string,
  author: { id: string; username: string },
  from: string | undefined,
  to: string,
  checkBudget: () => void,
) {
  const start = from ? sql`AND e.performed_on >= ${from}` : sql``;
  let exerciseId: string | undefined;
  let occurrenceId: string | undefined;
  let firstSet = true;
  let totals = exerciseStatistics();

  await write(
    `{"status":"included","author":${JSON.stringify(author)},"exercises":[`,
  );

  for await (const row of rows<TrainingRow>(
    tx,
    "export_training",
    sql`
    SELECT e.exercise_id AS "exerciseId",coalesce(x.name,e.name) AS "catalogName",
      (x.id IS NULL OR x.deleted_at IS NOT NULL) AS retired,
      e.id,e.name,e.session_id AS "sessionId",t.workout_id AS "workoutId",e.role,
      e.performed_on AS "performedOn",s.round,s.amount,s.right_amount AS "rightAmount",
      s.weight_kg::float8 AS "weightKg",s.unit,s.load,s.unilateral
    FROM training_session_exercises e
    JOIN training_sessions t ON t.id=e.session_id AND t.household_id=e.household_id AND t.user_id=e.user_id
    JOIN training_session_sets s ON s.session_exercise_id=e.id
    LEFT JOIN exercises x ON x.id=e.exercise_id AND x.household_id=e.household_id
    WHERE e.household_id=${householdId}::uuid AND e.user_id=${author.id}::uuid
      AND e.deleted_at IS NULL AND t.deleted_at IS NULL AND e.performed_on <= ${to} ${start}
    ORDER BY e.exercise_id,e.session_id,e.id,s.round
  `,
    checkBudget,
  )) {
    checkBudget();

    if (row.exerciseId !== exerciseId) {
      if (exerciseId !== undefined) {
        await write(`]}],"statistics":${JSON.stringify(totals.finish())}},`);
      }

      exerciseId = row.exerciseId;
      occurrenceId = undefined;
      totals = exerciseStatistics();
      await write(
        JSON.stringify({
          exercise: {
            id: row.exerciseId,
            name: row.catalogName,
            retired: row.retired,
          },
        }).slice(0, -1) + ',"performances":[',
      );
    }

    if (row.id !== occurrenceId) {
      if (occurrenceId !== undefined) {
        await write("]},");
      }

      occurrenceId = row.id;
      firstSet = true;
      const performance = {
        id: row.id,
        sessionId: row.sessionId,
        workoutId: row.workoutId,
        name: row.name,
        role: row.role,
        performedOn: row.performedOn,
      };
      await write(JSON.stringify(performance).slice(0, -1) + ',"sets":[');
    }

    const actual: ActualSet = {
      round: row.round,
      amount: row.amount,
      rightAmount: row.rightAmount,
      weightKg: row.weightKg,
      unit: row.unit,
      load: row.load,
      unilateral: row.unilateral,
    };
    totals.add(row.sessionId, row.performedOn, actual);
    await write((firstSet ? "" : ",") + JSON.stringify(actual));
    firstSet = false;
  }

  if (exerciseId !== undefined) {
    await write(`]}],"statistics":${JSON.stringify(totals.finish())}}`);
  }

  await write("]}");
}

export async function exportStatistics(
  db: Database,
  input: Options,
  write: Write,
  {
    now = new Date(),
    timeoutMs = 120_000,
  }: { now?: Date; timeoutMs?: number } = {},
) {
  const options = exportOptionsSchema.parse(input);
  const today = calendarDate(now, options.timeZone);
  const to = options.to ?? today;

  if (to > today || (options.from !== undefined && options.from > to)) {
    throw new Error("Invalid report period");
  }

  const started = performance.now();
  const checkBudget = () => {
    if (performance.now() - started > timeoutMs) {
      throw new Error("Export timed out");
    }
  };

  await db.transaction(
    async (tx) => {
      await tx.execute(
        sql`SELECT set_config('statement_timeout',${String(Math.min(timeoutMs, 30_000))},true)`,
      );
      const household = (
        await tx.execute<{ id: string; name: string }>(sql`
      SELECT id,name FROM households WHERE id=${options.householdId}::uuid AND deleted_at IS NULL
    `)
      ).rows[0];

      if (!household) {
        throw new Error("Household unavailable");
      }

      const settings = (
        await tx.execute<{ module_key: string; enabled: boolean }>(sql`
      SELECT module_key,enabled FROM household_module_settings WHERE household_id=${household.id}::uuid
    `)
      ).rows;
      const enabled = (key: string) =>
        settings.some((row) => row.module_key === key && row.enabled);
      const author = options.trainingUser
        ? (
            await tx.execute<{ id: string; username: string }>(sql`
      SELECT u.id,u.username FROM users u JOIN household_members m ON m.user_id=u.id
      WHERE m.household_id=${household.id}::uuid AND u.username=${options.trainingUser}
    `)
          ).rows[0]
        : undefined;

      if (options.trainingUser && !author) {
        throw new Error("Training author must be a current household member");
      }

      const metadata = {
        schemaVersion: 1,
        generatedAt: now.toISOString(),
        household,
        period: {
          mode: options.from ? "range" : "lifetime",
          from: options.from ?? null,
          to,
          timeZone: options.timeZone,
        },
        semantics: {
          weeklyStreaks:
            "within period, Monday–Sunday; partial boundary weeks count",
          recentWindows: "ending at period end, clipped to period",
          missingHabitDays: "unrecorded, not proof of failure",
          nullUnilateralRightAmount: "historical equal-to-left convention",
        },
      };
      await write(JSON.stringify(metadata).slice(0, -1) + ',"habits":');

      if (enabled("habits")) {
        await writeHabits(
          tx,
          write,
          household.id,
          options.from,
          to,
          checkBudget,
        );
      } else {
        await write('{"status":"disabled"}');
      }

      await write(',"training":');

      if (!enabled("workouts")) {
        await write('{"status":"disabled"}');
      } else if (!author) {
        await write('{"status":"not_requested"}');
      } else {
        await writeTraining(
          tx,
          write,
          household.id,
          author,
          options.from,
          to,
          checkBudget,
        );
      }

      checkBudget();
      await write("}\n");
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
