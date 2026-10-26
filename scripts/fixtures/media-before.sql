-- All UUIDs are deterministic so the post-migration checks identify each case.
INSERT INTO users (id, email, username, password_hash)
VALUES ('10000000-0000-4000-8000-000000000001', 'media-test@example.invalid', 'media-test', 'not-a-real-password');
INSERT INTO households (id, name) VALUES
('20000000-0000-4000-8000-000000000001', 'Media household'),
('20000000-0000-4000-8000-000000000002', 'Foreign household');
INSERT INTO household_members (id, household_id, user_id, role, sort_key) VALUES
('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner',0);
INSERT INTO household_module_settings (household_id, module_key, enabled)
VALUES ('20000000-0000-4000-8000-000000000001','recipes',true);
INSERT INTO recipes (id, household_id, title, sort_key, deleted_at) VALUES
('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','First recipe',0,NULL),
('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Second recipe',-1024,NULL),
('40000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','Deleted recipe',-2048,'2026-08-01Z'),
('40000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000002','Foreign recipe',0,NULL);
INSERT INTO recipe_cook_logs (id, household_id, recipe_id, cooked_at, comment, deleted_at) VALUES
('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','2026-08-01Z','Keep this cooking note',NULL),
('50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','2026-08-02Z','Deleted log, retained gallery image','2026-08-03Z');
INSERT INTO recipe_images (id, household_id, recipe_id, cook_log_id, object_key, content_type,
 byte_size, width, height, sort_key, confirmed_at, deleted_at, created_at, updated_at)
SELECT ('60000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
 '20000000-0000-4000-8000-000000000001'::uuid,
 CASE WHEN n=6 THEN '40000000-0000-4000-8000-000000000003' ELSE '40000000-0000-4000-8000-000000000001' END::uuid,
 CASE WHEN n=2 THEN '50000000-0000-4000-8000-000000000001' WHEN n=5 THEN '50000000-0000-4000-8000-000000000002' END::uuid,
 'households/20000000-0000-4000-8000-000000000001/recipes/' ||
 CASE WHEN n=6 THEN '40000000-0000-4000-8000-000000000003' ELSE '40000000-0000-4000-8000-000000000001' END ||
 '/60000000-0000-4000-8000-' || lpad(n::text,12,'0'),
 CASE WHEN n%3=0 THEN 'image/jpeg' WHEN n%3=1 THEN 'image/webp' ELSE 'image/png' END,
 n*100, n*200, n*100, 10000-n*1024,
 CASE WHEN n=3 THEN NULL ELSE '2026-08-10Z'::timestamptz END,
 CASE WHEN n=4 THEN '2026-08-11Z'::timestamptz END, '2026-08-01Z','2026-08-12Z'
FROM generate_series(1,6) n;
CREATE SCHEMA media_migration_test;
CREATE TABLE media_migration_test.images AS TABLE recipe_images;
CREATE TABLE media_migration_test.recipes AS TABLE recipes;
CREATE TABLE media_migration_test.logs AS TABLE recipe_cook_logs;
