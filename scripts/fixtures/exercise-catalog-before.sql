INSERT INTO users(id,email,username,password_hash) VALUES ('10000000-0000-4000-8000-000000000001','catalog@example.invalid','catalog','test');
INSERT INTO households(id,name) VALUES ('10000000-0000-4000-8000-000000000002','Catalog fixture');
INSERT INTO workouts(id,household_id,title,notes,sort_key) VALUES ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','Before','Shared note',1024);
INSERT INTO exercises(id,household_id,name,normalized_name,unit,load,unilateral,archived,created_at,updated_at) VALUES
 ('10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','Zulu','zulu','reps','single',false,false,'2026-01-01','2026-01-02'),
 ('10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','Alpha','alpha','reps','single',false,false,'2026-01-01','2026-01-02'),
 ('10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000002','Bravo','bravo','reps','per-hand',true,false,'2026-01-01','2026-01-02'),
 ('10000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000002','Private historical','private historical','seconds','bodyweight',true,true,'2026-01-01','2026-01-02');
INSERT INTO workout_exercises(id,household_id,workout_id,exercise_id,sets,target,sort_key) VALUES ('10000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005',3,'8–12',1024);
INSERT INTO workout_logs(id,household_id,user_id,workout_id,note,snapshot,completed_on,completed_at) VALUES ('10000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','Private note','{"title":"Old title","exercises":[{"id":"10000000-0000-4000-8000-000000000008","catalogExerciseId":"10000000-0000-4000-8000-000000000007","name":"Private historical","sets":1,"target":"","unit":"seconds","load":"bodyweight","unilateral":true}]}','2026-01-01','2026-01-01');
INSERT INTO workout_log_sets(log_id,household_id,workout_exercise_id,exercise_id,round,amount,unit,load,unilateral) VALUES ('10000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000007',1,13,'seconds','bodyweight',true);
CREATE TABLE catalog_before AS SELECT
 (SELECT jsonb_agg(to_jsonb(e)-'archived' ORDER BY id) FROM exercises e) AS identities,
 (SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM workout_logs l) AS logs,
 (SELECT jsonb_agg(to_jsonb(s) ORDER BY log_id,workout_exercise_id,round) FROM workout_log_sets s) AS sets,
 (SELECT jsonb_agg(to_jsonb(s) ORDER BY workout_id,id) FROM workout_exercises s) AS slots;
