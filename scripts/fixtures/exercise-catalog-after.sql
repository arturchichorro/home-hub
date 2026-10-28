DO $$ BEGIN
 IF (SELECT jsonb_agg(to_jsonb(e)-'deleted_at'-'sort_key' ORDER BY id) FROM exercises e) IS DISTINCT FROM (SELECT identities FROM catalog_before)
 OR (SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM workout_logs l) IS DISTINCT FROM (SELECT logs FROM catalog_before)
 OR (SELECT jsonb_agg(to_jsonb(s) ORDER BY log_id,workout_exercise_id,round) FROM workout_log_sets s) IS DISTINCT FROM (SELECT sets FROM catalog_before)
 OR (SELECT jsonb_agg(to_jsonb(s) ORDER BY workout_id,id) FROM workout_exercises s) IS DISTINCT FROM (SELECT slots FROM catalog_before)
 THEN RAISE EXCEPTION 'Catalog migration changed historical identities, logs, sets or slots'; END IF;
 IF (SELECT array_agg(name ORDER BY sort_key DESC,id) FROM exercises WHERE deleted_at IS NULL) <> ARRAY['Alpha','Bravo','Zulu']
 THEN RAISE EXCEPTION 'Catalog ordering was not preserved'; END IF;
 IF NOT EXISTS (SELECT FROM exercises WHERE normalized_name='private historical' AND deleted_at='2026-01-02'::timestamptz)
 THEN RAISE EXCEPTION 'Historical-only identity became public'; END IF;
 IF EXISTS (SELECT FROM information_schema.columns WHERE table_name='exercises' AND column_name='archived')
 THEN RAISE EXCEPTION 'Obsolete archive column remains'; END IF;
 IF NOT EXISTS (SELECT FROM pg_index WHERE indrelid='exercises'::regclass AND indisprimary)
 OR NOT EXISTS (SELECT FROM pg_index WHERE indrelid='workout_log_sets'::regclass AND indisprimary)
 THEN RAISE EXCEPTION 'Primary key was lost'; END IF;
END $$;
INSERT INTO exercises(id,household_id,name,normalized_name,unit,load,unilateral) VALUES ('10000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000002','Private historical','private historical','reps','single',false);
DO $$ BEGIN
 BEGIN
 INSERT INTO exercises(id,household_id,name,normalized_name,unit,load,unilateral) VALUES ('10000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000002','Private historical','private historical','reps','single',false);
 RAISE EXCEPTION 'Duplicate active name accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
END $$;
