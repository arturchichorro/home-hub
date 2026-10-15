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
  IF to_regclass('public.habits') IS NULL OR to_regclass('public.habit_completions') IS NULL THEN
    RAISE EXCEPTION 'Habits tables are missing';
  END IF;
  IF EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'home_hub'
  ) THEN
    RAISE EXCEPTION 'Application tables must remain in public';
  END IF;
  IF EXISTS (
    SELECT FROM (VALUES ('habits', 'created_on'), ('habits', 'archived_at'), ('habits', 'sort_key'),
      ('habit_completions', 'completed_on'), ('habit_completions', 'user_id')) AS expected(table_name, column_name)
    LEFT JOIN pg_publication_tables published ON published.pubname = 'home_hub_zero'
      AND published.schemaname = 'public' AND published.tablename = expected.table_name
    WHERE published.tablename IS NULL OR NOT COALESCE(expected.column_name = ANY(published.attnames), false)
  ) THEN
    RAISE EXCEPTION 'Habits Zero publication columns are missing';
  END IF;
  IF EXISTS (
    SELECT FROM public.households h
    WHERE NOT EXISTS (SELECT FROM public.household_module_settings s WHERE s.household_id = h.id AND s.module_key = 'habits')
  ) THEN
    RAISE EXCEPTION 'Habits module settings were not backfilled';
  END IF;

  INSERT INTO users (id, username, email, password_hash) VALUES (person, person::text, person::text || '@example.invalid', 'test-only');
  INSERT INTO households (id, name) VALUES (household_a, 'Habits verification A'), (household_b, 'Habits verification B');
  INSERT INTO habits (id, household_id, name, created_on) VALUES (habit, household_a, 'Read', '2026-10-12');
  INSERT INTO habit_completions (household_id, habit_id, user_id, completed_on) VALUES (household_a, habit, person, '2026-10-14');
  INSERT INTO habit_completions (household_id, habit_id, user_id, completed_on) VALUES (household_a, habit, person, '2026-10-14') ON CONFLICT DO NOTHING;
  IF (SELECT count(*) FROM habit_completions WHERE habit_id = habit AND user_id = person) <> 1 THEN
    RAISE EXCEPTION 'Repeated completions must be idempotent';
  END IF;
  BEGIN
    INSERT INTO habit_completions (household_id, habit_id, user_id, completed_on) VALUES (household_b, habit, person, '2026-10-15');
    RAISE EXCEPTION 'Cross-household completion unexpectedly allowed';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO habit_completions (household_id, habit_id, user_id, completed_on) VALUES (household_a, habit, person, '2026-02-30');
    RAISE EXCEPTION 'Invalid date unexpectedly allowed';
  EXCEPTION WHEN datetime_field_overflow OR check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO habit_completions (household_id, habit_id, user_id, completed_on) VALUES (household_a, habit, person, '2026-2-03');
    RAISE EXCEPTION 'Noncanonical date unexpectedly allowed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE habits SET name = '' WHERE id = habit;
    RAISE EXCEPTION 'Empty habit name unexpectedly allowed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
ROLLBACK;
