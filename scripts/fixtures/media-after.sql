DO $$
BEGIN
  IF (SELECT count(*) FROM media) <> 6 OR (SELECT count(*) FROM recipe_media) <> 6
    OR to_regclass('recipe_images') IS NOT NULL THEN
    RAISE EXCEPTION 'Asset/attachment count mismatch or old table retained';
  END IF;
  IF EXISTS (
    SELECT id, household_id, recipe_id, cook_log_id, object_key, content_type,
      byte_size, width, height, sort_key, confirmed_at, deleted_at, created_at, updated_at
    FROM media_migration_test.images
    EXCEPT ALL
    SELECT a.id,a.household_id,a.recipe_id,a.cook_log_id,m.object_key,m.content_type,
      m.byte_size,m.width,m.height,a.sort_key,m.confirmed_at,a.deleted_at,a.created_at,a.updated_at
    FROM recipe_media a JOIN media m ON (m.household_id,m.id)=(a.household_id,a.media_id)
  ) OR EXISTS (SELECT FROM media WHERE kind <> 'image' OR duration_ms IS NOT NULL OR animated IS NOT NULL)
    OR EXISTS (SELECT FROM media_migration_test.recipes EXCEPT ALL SELECT FROM recipes)
    OR EXISTS (SELECT FROM media_migration_test.logs EXCEPT ALL SELECT FROM recipe_cook_logs)
  THEN RAISE EXCEPTION 'Migration changed stored recipe image or parent data'; END IF;
  IF EXISTS (
    SELECT FROM pg_publication_tables WHERE pubname='home_hub_zero'
      AND (tablename='recipe_images' OR (tablename='media' AND 'object_key'=ANY(attnames)))
  ) OR NOT EXISTS (
    SELECT FROM pg_publication_tables WHERE pubname='home_hub_zero'
      AND tablename='media' AND 'confirmed_at'=ANY(attnames)
  ) OR NOT EXISTS (
    SELECT FROM pg_publication_tables WHERE pubname='home_hub_zero'
      AND tablename='recipe_media' AND 'media_id'=ANY(attnames)
  ) THEN RAISE EXCEPTION 'Unsafe or incomplete media publication'; END IF;

  BEGIN
    INSERT INTO recipe_media (id,household_id,recipe_id,media_id,sort_key)
    VALUES ('70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000001',0);
    RAISE EXCEPTION 'Cross-household asset attachment accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO recipe_media (id,household_id,recipe_id,media_id,cook_log_id,sort_key)
    VALUES ('70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',0);
    RAISE EXCEPTION 'Cross-recipe cooking context accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  INSERT INTO recipe_media (id,household_id,recipe_id,media_id,sort_key)
  VALUES ('70000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001',0);
  UPDATE recipe_media SET deleted_at=now() WHERE id='60000000-0000-4000-8000-000000000001';
  IF NOT EXISTS (
    SELECT FROM recipe_media a JOIN media m ON m.id=a.media_id
    WHERE a.id='70000000-0000-4000-8000-000000000002' AND a.deleted_at IS NULL AND m.deleted_at IS NULL AND m.confirmed_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Unlinking damaged a shared asset'; END IF;

  BEGIN
    UPDATE media SET byte_size=0 WHERE id='60000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Invalid byte size accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE media SET duration_ms=123 WHERE id='60000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Video metadata accepted on image';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE media SET kind='video',content_type='video/mp4' WHERE id='60000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Unsupported video enabled before validation/delivery';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
