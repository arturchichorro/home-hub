-- Run after the complete migration history, against a disposable database.
BEGIN;
DO $$
DECLARE
  h uuid := gen_random_uuid(); other_h uuid := gen_random_uuid();
  u uuid := gen_random_uuid(); other_u uuid := gen_random_uuid();
  p uuid := gen_random_uuid(); c uuid := gen_random_uuid(); s uuid := gen_random_uuid();
BEGIN
  IF (SELECT count(*) FROM pg_publication_tables WHERE pubname = 'home_hub_zero'
      AND schemaname = 'public' AND tablename IN ('workout_plans','workout_cycles','workout_sessions','workout_sets')) <> 4 THEN
    RAISE EXCEPTION 'Workouts publication is incomplete';
  END IF;
  IF EXISTS (SELECT 1 FROM public.households h WHERE NOT EXISTS (
    SELECT 1 FROM public.household_module_settings s WHERE s.household_id = h.id AND s.module_key = 'workouts'
  )) THEN RAISE EXCEPTION 'Missing backfilled Workouts module settings'; END IF;
  INSERT INTO public.users (id,email,username,password_hash) VALUES
    (u,u::text || '@example.test',u::text,'test'),(other_u,other_u::text || '@example.test',other_u::text,'test');
  INSERT INTO public.households (id,name) VALUES (h,'Workout test'),(other_h,'Other');
  INSERT INTO public.workout_plans (id,household_id,title,definition) VALUES (p,h,'Test','{}');
  BEGIN
    INSERT INTO public.workout_cycles (id,household_id,user_id,plan_id,started_on) VALUES (gen_random_uuid(),other_h,u,p,'2026-10-26');
    RAISE EXCEPTION 'Cross-household plan reference was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  INSERT INTO public.workout_cycles (id,household_id,user_id,plan_id,started_on) VALUES (c,h,u,p,'2026-10-26');
  BEGIN
    INSERT INTO public.workout_sessions (id,household_id,user_id,cycle_id,workout_id,snapshot,low_energy,status)
    VALUES (gen_random_uuid(),h,other_u,c,gen_random_uuid(),'{}',false,'active');
    RAISE EXCEPTION 'Another user could reference a private cycle';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  INSERT INTO public.workout_sessions (id,household_id,user_id,cycle_id,workout_id,snapshot,low_energy,status)
  VALUES (s,h,u,c,gen_random_uuid(),'{}',false,'active');
  BEGIN
    INSERT INTO public.workout_sessions (id,household_id,user_id,cycle_id,workout_id,snapshot,low_energy,status)
    VALUES (gen_random_uuid(),h,u,c,gen_random_uuid(),'{}',false,'active');
    RAISE EXCEPTION 'Duplicate active session accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    UPDATE public.workout_sessions SET status = 'completed' WHERE id = s;
    RAISE EXCEPTION 'Completion without date accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE public.workout_sessions SET status='completed',completed_at=now(),completed_on='2026-10-26' WHERE id=s;
  INSERT INTO public.workout_sets (session_id,exercise_id,round,values) VALUES (s,p,1,'{}');
  BEGIN
    INSERT INTO public.workout_sets (session_id,exercise_id,round,values) VALUES (s,p,1,'{}');
    RAISE EXCEPTION 'Duplicate set natural key accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
ROLLBACK;
