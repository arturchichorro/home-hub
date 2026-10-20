ALTER TABLE "habits" ADD COLUMN "sort_key" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Preserve the previous newest-first ordering, independently in each household.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY household_id ORDER BY created_at DESC, id ASC) AS position,
    count(*) OVER (PARTITION BY household_id) AS total
  FROM public.habits
)
UPDATE public.habits AS habit
SET sort_key = ((ranked.total - ranked.position + 1) * 1024)::integer
FROM ranked WHERE habit.id = ranked.id;--> statement-breakpoint
CREATE INDEX "habits_household_sort_key_idx" ON "habits" USING btree ("household_id","sort_key","id") WHERE "habits"."archived_at" is null;--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" DROP TABLE "public"."habits";--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."habits" (
  "id", "household_id", "name", "sort_key", "created_on", "archived_at", "created_at", "updated_at"
);
