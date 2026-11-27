import { type SQL, sql } from "drizzle-orm";

type Executor = { execute: (query: SQL) => PromiseLike<unknown> };

// Eligibility is an instant, not a periodically maintained boolean. Once midnight
// passes every reader sees completion without a cron, polling, or read-side writes.
// Only this derived date-level value is public; item IDs and mappings remain private.
export async function refreshHabitCalendarCompletion(
  db: Executor,
  householdId: string,
) {
  await db.execute(sql`
    WITH eligible AS MATERIALIZED (
      SELECT l.household_id, l.habit_id, l.user_id, i.day AS entry_on,
        min(b.eligible_at) AS eligible_at
      FROM calendar_habit_attachments l
      JOIN calendar_items i ON i.id=l.item_id AND i.household_id=l.household_id
      JOIN household_members m ON m.household_id=l.household_id AND m.user_id=l.user_id
      CROSS JOIN LATERAL (
        SELECT (i.day::date + 1)::timestamp AT TIME ZONE l.time_zone AS midnight
      ) n
      CROSS JOIN LATERAL (
        -- Try both sides of an offset transition. PostgreSQL's default chooses the
        -- later ambiguous midnight; a habit must qualify at the FIRST midnight.
        SELECT min(v.boundary) AS eligible_at FROM (
          SELECT ((i.day::date + 1)::timestamp AT TIME ZONE 'UTC') -
            (((n.midnight + o.step) AT TIME ZONE l.time_zone) -
             ((n.midnight + o.step) AT TIME ZONE 'UTC')) AS boundary
          FROM (VALUES (interval '-2 days'), (interval '0 days'), (interval '2 days')) o(step)
        ) v WHERE (v.boundary AT TIME ZONE l.time_zone)::date > i.day::date
      ) b
      WHERE l.household_id=${householdId}::uuid AND i.deleted_at IS NULL
        AND (i.end_day IS NULL OR i.end_day=i.day)
      GROUP BY l.household_id,l.habit_id,l.user_id,i.day
    ), cleared AS (
      UPDATE habit_entries e SET calendar_eligible_at=NULL,updated_at=now()
      WHERE e.household_id=${householdId}::uuid AND e.calendar_eligible_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM eligible q
          WHERE q.habit_id=e.habit_id AND q.user_id=e.user_id AND q.entry_on=e.entry_on)
      RETURNING e.habit_id
    )
    INSERT INTO habit_entries(household_id,habit_id,user_id,entry_on,completed,calendar_eligible_at)
      SELECT household_id,habit_id,user_id,entry_on,false,eligible_at FROM eligible
    ON CONFLICT(habit_id,user_id,entry_on) DO UPDATE
      SET calendar_eligible_at=excluded.calendar_eligible_at,updated_at=now()
      WHERE habit_entries.calendar_eligible_at IS DISTINCT FROM excluded.calendar_eligible_at
  `);
}
