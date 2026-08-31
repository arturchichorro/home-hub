-- Drizzle runs this migration in a transaction. Hold source writes until both
-- the snapshot and its forward-mirroring triggers are installed, with no gap.
-- Reads remain available. Run before exposing any Lists writers.
LOCK TABLE "public"."households", "public"."household_module_settings",
	"public"."shopping_items" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
-- Migration-owned compatibility state, deliberately outside the domain schema
-- and Zero publication. Drop it with the bridge after retiring Shopping writers.
-- Keep the target ID stable even if the migrated list is renamed or reordered.
CREATE TABLE "public"."shopping_list_migration_links" (
	"household_id" uuid PRIMARY KEY,
	"list_id" uuid NOT NULL,
	FOREIGN KEY ("household_id", "list_id")
		REFERENCES "public"."lists" ("household_id", "id") ON DELETE CASCADE
);
--> statement-breakpoint
-- Include every existing household, even those without shopping items.
INSERT INTO "public"."lists" (
	"id",
	"household_id",
	"name",
	"normalized_name",
	"sort_key"
)
SELECT
	gen_random_uuid(),
	"household"."id",
	'Shopping',
	'shopping',
	1024
FROM "public"."households" AS "household";
--> statement-breakpoint
INSERT INTO "public"."shopping_list_migration_links" ("household_id", "list_id")
SELECT "household_id", "id"
FROM "public"."lists"
WHERE "normalized_name" = 'shopping';
--> statement-breakpoint
-- Preserve item identities and history; leave the source rows untouched.
INSERT INTO "public"."list_items" (
	"id",
	"household_id",
	"list_id",
	"name",
	"normalized_name",
	"status",
	"sort_key",
	"created_at",
	"updated_at"
)
SELECT
	"item"."id",
	"item"."household_id",
	"link"."list_id",
	"item"."name",
	"item"."normalized_name",
	"item"."status"::text::"public"."list_item_status",
	"item"."sort_key",
	"item"."created_at",
	"item"."updated_at"
FROM "public"."shopping_items" AS "item"
INNER JOIN "public"."shopping_list_migration_links" AS "link"
	ON "link"."household_id" = "item"."household_id";
--> statement-breakpoint
-- Preserve disabled modules as well as enabled ones; keep the legacy row until
-- cutover. A missing Shopping setting remains missing (authorization fails closed).
INSERT INTO "public"."household_module_settings" (
	"household_id", "module_key", "enabled", "created_at", "updated_at"
)
SELECT "household_id", 'lists', "enabled", "created_at", "updated_at"
FROM "public"."household_module_settings"
WHERE "module_key" = 'shopping';
--> statement-breakpoint
CREATE FUNCTION "public"."mirror_shopping_item_to_lists"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
	source_household_id uuid;
	target_list_id uuid;
BEGIN
	IF TG_OP = 'UPDATE' THEN
		IF NEW.id <> OLD.id OR NEW.household_id <> OLD.household_id THEN
			RAISE EXCEPTION 'Shopping item identity cannot change during Lists migration';
		END IF;
	END IF;

	IF TG_OP = 'DELETE' THEN
		source_household_id := OLD.household_id;
	ELSE
		source_household_id := NEW.household_id;
	END IF;

	SELECT list_id INTO STRICT target_list_id
	FROM public.shopping_list_migration_links
	WHERE household_id = source_household_id;

	IF TG_OP = 'INSERT' THEN
		INSERT INTO public.list_items (
			id, household_id, list_id, name, normalized_name, status,
			sort_key, created_at, updated_at
		) VALUES (
			NEW.id, NEW.household_id, target_list_id, NEW.name, NEW.normalized_name,
			NEW.status::text::public.list_item_status,
			NEW.sort_key, NEW.created_at, NEW.updated_at
		);
	ELSIF TG_OP = 'UPDATE' THEN
		UPDATE public.list_items SET
			name = NEW.name,
			normalized_name = NEW.normalized_name,
			status = NEW.status::text::public.list_item_status,
			sort_key = NEW.sort_key,
			created_at = NEW.created_at,
			updated_at = NEW.updated_at
		WHERE id = OLD.id AND household_id = OLD.household_id
			AND list_id = target_list_id;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'Missing Lists mirror for Shopping item %', OLD.id;
		END IF;
	ELSE
		DELETE FROM public.list_items
		WHERE id = OLD.id AND household_id = OLD.household_id
			AND list_id = target_list_id;
	END IF;

	-- AFTER trigger: return value is ignored. Never swallow errors: the source
	-- write and its mirror must either both commit or both roll back.
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "shopping_items_mirror_to_lists"
AFTER INSERT OR UPDATE OR DELETE ON "public"."shopping_items"
FOR EACH ROW EXECUTE FUNCTION "public"."mirror_shopping_item_to_lists"();
--> statement-breakpoint
CREATE FUNCTION "public"."mirror_shopping_module_to_lists"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
	target_list_id uuid;
BEGIN
	IF TG_OP = 'UPDATE' THEN
		IF (OLD.module_key = 'shopping' OR NEW.module_key = 'shopping')
			AND (NEW.module_key <> OLD.module_key OR NEW.household_id <> OLD.household_id) THEN
			RAISE EXCEPTION 'Shopping module identity cannot change during Lists migration';
		END IF;
	END IF;

	IF TG_OP = 'DELETE' THEN
		IF OLD.module_key = 'shopping' THEN
			DELETE FROM public.household_module_settings
			WHERE household_id = OLD.household_id AND module_key = 'lists';
		END IF;
		RETURN NULL;
	END IF;

	-- Writes to Lists or other module settings are not mirrored back or recursed.
	IF NEW.module_key <> 'shopping' THEN
		RETURN NULL;
	END IF;

	IF TG_OP = 'INSERT' THEN
		SELECT list_id INTO target_list_id
		FROM public.shopping_list_migration_links
		WHERE household_id = NEW.household_id;
		IF NOT FOUND THEN
			-- The old household-creation transaction inserts a Shopping setting.
			-- The new app will insert only a Lists setting, so its households stay empty.
			target_list_id := gen_random_uuid();
			INSERT INTO public.lists (id, household_id, name, normalized_name, sort_key)
			VALUES (target_list_id, NEW.household_id, 'Shopping', 'shopping', 1024);
			INSERT INTO public.shopping_list_migration_links (household_id, list_id)
			VALUES (NEW.household_id, target_list_id);
		END IF;
	END IF;

	INSERT INTO public.household_module_settings (
		household_id, module_key, enabled, created_at, updated_at
	) VALUES (
		NEW.household_id, 'lists', NEW.enabled, NEW.created_at, NEW.updated_at
	)
	ON CONFLICT (household_id, module_key) DO UPDATE SET
		enabled = EXCLUDED.enabled,
		created_at = EXCLUDED.created_at,
		updated_at = EXCLUDED.updated_at;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "shopping_module_mirror_to_lists"
AFTER INSERT OR UPDATE OR DELETE ON "public"."household_module_settings"
FOR EACH ROW EXECUTE FUNCTION "public"."mirror_shopping_module_to_lists"();
--> statement-breakpoint
-- Publish only domain data, never the temporary migration mapping.
ALTER PUBLICATION "home_hub_zero" ADD TABLE
  "public"."lists" (
    "id", "household_id", "name", "normalized_name", "sort_key", "created_at", "updated_at"
  ),
  "public"."list_items" (
    "id", "household_id", "list_id", "name", "normalized_name", "status", "sort_key", "created_at", "updated_at"
  );
