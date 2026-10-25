ALTER TABLE "workouts" ADD COLUMN "sort_key" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Preserve the previous alphabetical order, independently for each household.
WITH ranked AS (
  SELECT id, (count(*) OVER (PARTITION BY household_id)
    - row_number() OVER (PARTITION BY household_id ORDER BY title, id) + 1) * 1024 AS sort_key
  FROM public.workouts
)
UPDATE public.workouts w SET sort_key = ranked.sort_key::integer
FROM ranked WHERE w.id = ranked.id;--> statement-breakpoint
CREATE INDEX "workouts_household_sort_key_id" ON "workouts" USING btree ("household_id","sort_key","id");