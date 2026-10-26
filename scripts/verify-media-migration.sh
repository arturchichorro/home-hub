#!/usr/bin/env bash
# Exercise the real forward migration in disposable databases, never app data.
set -euo pipefail
cd "$(dirname "$0")/.."
container="${1:?Usage: scripts/verify-media-migration.sh <postgres-container>}"
user="${POSTGRES_USER:-home_hub}"
prefix="media_migration_${RANDOM}_$$"
databases=()
cleanup() {
  for database in "${databases[@]}"; do
    docker exec "$container" psql -X -U "$user" -d postgres -v ON_ERROR_STOP=1 \
      -c "DROP DATABASE IF EXISTS \"$database\" WITH (FORCE);" >/dev/null
  done
}
trap cleanup EXIT
for scenario in empty populated; do
  database="${prefix}_${scenario}"
  databases+=("$database")
  docker exec "$container" psql -X -U "$user" -d postgres -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE \"$database\";" >/dev/null
  for migration in packages/database/drizzle/*.sql; do
    if [[ "$scenario" == populated && "$migration" == */0043_* ]]; then
      docker exec -i "$container" psql -X -U "$user" -d "$database" -v ON_ERROR_STOP=1 \
        < scripts/fixtures/media-before.sql >/dev/null
    fi
    { printf 'BEGIN;\nSET LOCAL search_path TO public;\n'; \
      # Read SQL as input; statement-breakpoint markers are PostgreSQL comments.
      cat "$migration"
      printf '\nCOMMIT;\n'; } | \
      docker exec -i "$container" psql -X -U "$user" -d "$database" -v ON_ERROR_STOP=1 >/dev/null
  done
  if [[ "$scenario" == populated ]]; then
    docker exec -i "$container" psql -X -U "$user" -d "$database" -v ON_ERROR_STOP=1 \
      < scripts/fixtures/media-after.sql >/dev/null
  else
    docker exec "$container" psql -X -U "$user" -d "$database" -v ON_ERROR_STOP=1 -c \
      "DO \$\$ BEGIN IF EXISTS (SELECT FROM media) OR EXISTS (SELECT FROM recipe_media) OR to_regclass('recipe_images') IS NOT NULL THEN RAISE EXCEPTION 'Invalid empty media migration'; END IF; END \$\$;" >/dev/null
  fi
  if [[ "$scenario" == empty && -n "${DATABASE_URL:-}" ]]; then
    runtime_url="$(MEDIA_TEST_DATABASE_NAME="$database" node -e 'const u = new URL(process.env.DATABASE_URL); u.pathname = "/" + process.env.MEDIA_TEST_DATABASE_NAME; process.stdout.write(u.toString());')"
    MEDIA_TEST_DATABASE_URL="$runtime_url" pnpm exec vitest run apps/api/src/media/recipes.integration.test.ts apps/api/src/workouts/exercise-media.integration.test.ts
  fi
  printf 'Shared media migration: %s passed\n' "$scenario"
done
