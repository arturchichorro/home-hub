-- Run after migrations against a disposable database. Fixtures are rolled back.
BEGIN;
SET LOCAL search_path TO public;
DO $$
DECLARE
  household_a uuid := gen_random_uuid();
  household_b uuid := gen_random_uuid();
  person uuid := gen_random_uuid();
  habit uuid := gen_random_uuid();
BEGIN
  IF to_regclass('public.habits') IS NULL OR to_regclass('public.habit_entries') IS NULL THEN
    RAISE EXCEPTION 'Habits tables are missing';
  END IF;
  IF EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'home_hub'
  ) THEN
    RAISE EXCEPTION 'Application tables must remain in public';
  END IF;
  IF EXISTS (
    SELECT FROM (VALUES ('habits', 'status'), ('habits', 'sort_key'), ('habits', 'note'), ('habit_entries', 'note'), ('habit_entries', 'completed'),
      ('habit_entries', 'entry_on'), ('habit_entries', 'user_id')) AS expected(table_name, column_name)
    LEFT JOIN pg_publication_tables published ON published.pubname = 'home_hub_zero'
      AND published.schemaname = 'public' AND published.tablename = expected.table_name
    WHERE published.tablename IS NULL OR NOT COALESCE(expected.column_name = ANY(published.attnames), false)
  ) THEN
    RAISE EXCEPTION 'Habits Zero publication columns are missing';
  END IF;
  IF EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'habits' AND column_name IN ('created_on', 'archived_at')) THEN
    RAISE EXCEPTION 'Unused habit dates must be removed';
  END IF;
  IF EXISTS (
    SELECT FROM public.households h
    WHERE NOT EXISTS (SELECT FROM public.household_module_settings s WHERE s.household_id = h.id AND s.module_key = 'habits')
  ) THEN
    RAISE EXCEPTION 'Habits module settings were not backfilled';
  END IF;

  INSERT INTO users (id, username, email, password_hash) VALUES (person, person::text, person::text || '@example.invalid', 'test-only');
  INSERT INTO households (id, name) VALUES (household_a, 'Habits verification A'), (household_b, 'Habits verification B');
  INSERT INTO habits (id, household_id, name) VALUES (habit, household_a, 'Read');
  IF (SELECT status FROM habits WHERE id = habit) <> 'active' THEN
    RAISE EXCEPTION 'New habits must default to active';
  END IF;
  INSERT INTO habit_entries (household_id, habit_id, user_id, entry_on) VALUES (household_a, habit, person, '2026-10-14');
  INSERT INTO habit_entries (household_id, habit_id, user_id, entry_on) VALUES (household_a, habit, person, '2026-10-14') ON CONFLICT DO NOTHING;
  IF (SELECT count(*) FROM habit_entries WHERE habit_id = habit AND user_id = person) <> 1 THEN
    RAISE EXCEPTION 'Repeated completions must be idempotent';
  END IF;
  BEGIN
    INSERT INTO habit_entries (household_id, habit_id, user_id, entry_on) VALUES (household_b, habit, person, '2026-10-15');
    RAISE EXCEPTION 'Cross-household completion unexpectedly allowed';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO habit_entries (household_id, habit_id, user_id, entry_on) VALUES (household_a, habit, person, '2026-02-30');
    RAISE EXCEPTION 'Invalid date unexpectedly allowed';
  EXCEPTION WHEN datetime_field_overflow OR check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO habit_entries (household_id, habit_id, user_id, entry_on) VALUES (household_a, habit, person, '2026-2-03');
    RAISE EXCEPTION 'Noncanonical date unexpectedly allowed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE habits SET name = '' WHERE id = habit;
    RAISE EXCEPTION 'Empty habit name unexpectedly allowed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE habits SET note = 'Shared note' WHERE id = habit;
  UPDATE habit_entries SET note = 'Daily note', completed = false WHERE habit_id = habit;
  IF NOT EXISTS (SELECT FROM habit_entries WHERE habit_id = habit AND note = 'Daily note' AND NOT completed) THEN
    RAISE EXCEPTION 'Unchecking must retain the daily note';
  END IF;
  INSERT INTO habit_entries (household_id, habit_id, user_id, entry_on, note)
    VALUES (household_a, habit, person, '2026-10-13', 'Note only');
  IF EXISTS (SELECT FROM habit_entries WHERE habit_id = habit AND entry_on = '2026-10-13' AND completed) THEN
    RAISE EXCEPTION 'Note-only entries must default to incomplete';
  END IF;
  INSERT INTO habit_entries (household_id, habit_id, user_id, entry_on, completed)
    VALUES (household_a, habit, person, '2026-10-13', true)
    ON CONFLICT (habit_id, user_id, entry_on) DO UPDATE SET completed = EXCLUDED.completed;
  INSERT INTO habit_entries (household_id, habit_id, user_id, entry_on, note)
    VALUES (household_a, habit, person, '2026-10-13', 'Edited note')
    ON CONFLICT (habit_id, user_id, entry_on) DO UPDATE SET note = EXCLUDED.note;
  IF NOT EXISTS (SELECT FROM habit_entries WHERE habit_id = habit AND entry_on = '2026-10-13' AND completed AND note = 'Edited note') THEN
    RAISE EXCEPTION 'Partial upserts must preserve independent fields';
  END IF;
  BEGIN
    UPDATE habits SET note = repeat('a', 501) WHERE id = habit;
    RAISE EXCEPTION 'Overlong shared note unexpectedly allowed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE habit_entries SET note = repeat('a', 501) WHERE habit_id = habit;
    RAISE EXCEPTION 'Overlong daily note unexpectedly allowed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE habits SET status = 'archived' WHERE id = habit;
  BEGIN
    UPDATE habits SET status = 'deleted' WHERE id = habit;
    RAISE EXCEPTION 'Unknown habit status unexpectedly allowed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
ROLLBACK;
