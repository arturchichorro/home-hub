DO $$ BEGIN
 IF (SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM workout_logs l) IS DISTINCT FROM (SELECT logs FROM logging_before)
 OR (SELECT jsonb_agg(to_jsonb(s) ORDER BY log_id,workout_exercise_id,round) FROM workout_log_sets s) IS DISTINCT FROM (SELECT sets FROM logging_before)
 THEN RAISE EXCEPTION 'Original history, notes, dates or measurements changed'; END IF;
 IF EXISTS (SELECT FROM exercise_logs WHERE substring(id::text from 15 for 1)<>'5' OR substring(id::text from 20 for 1)<>'a') THEN RAISE EXCEPTION 'Backfilled occurrence IDs are not RFC-compliant'; END IF;
 IF (SELECT count(*) FROM exercise_logs) <> 4 OR (SELECT count(*) FROM exercise_log_sets) <> 5 OR (SELECT count(*) FROM workout_log_exercises) <> 4 THEN RAISE EXCEPTION 'Incorrect occurrence backfill'; END IF;
 IF EXISTS(SELECT FROM exercise_logs e JOIN workout_log_exercises w ON w.exercise_log_id=e.id JOIN workout_logs l ON l.id=w.workout_log_id WHERE e.user_id<>l.user_id OR e.household_id<>l.household_id OR e.performed_on<>l.completed_on OR e.performed_at<>l.completed_at OR e.snapshot<>l.snapshot->'exercises'->w.position) THEN RAISE EXCEPTION 'Occurrence identity/date/snapshot changed'; END IF;
 IF (SELECT count(*) FROM pg_publication_tables WHERE pubname='home_hub_zero' AND tablename IN ('exercise_logs','exercise_log_sets','workout_log_exercises'))<>3 THEN RAISE EXCEPTION 'Missing publication'; END IF;
 INSERT INTO exercise_logs(id,household_id,user_id,exercise_id,performed_on,performed_at,snapshot) SELECT '20000000-0000-4000-8000-000000000040', household_id,user_id,exercise_id,performed_on,performed_at,snapshot FROM exercise_logs WHERE user_id='20000000-0000-4000-8000-000000000001' LIMIT 1;
 BEGIN
 INSERT INTO workout_log_exercises VALUES ('20000000-0000-4000-8000-000000000022','20000000-0000-4000-8000-000000000041','20000000-0000-4000-8000-000000000040','20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002',0);
 RAISE EXCEPTION 'Cross-author link accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
 DELETE FROM exercise_logs WHERE id='20000000-0000-4000-8000-000000000040';
END $$;
