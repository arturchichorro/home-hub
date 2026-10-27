#!/usr/bin/env bash
# Run only against disposable databases; never alter application data.
set -euo pipefail
cd "$(dirname "$0")/.."
container="${1:?Usage: scripts/verify-exercise-catalog-migration.sh <postgres-container>}"
user="${POSTGRES_USER:-home_hub}"
database="catalog_migration_${RANDOM}_$$"
cleanup() {
 docker exec "$container" psql -X -U "$user" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$database\" WITH (FORCE);" >/dev/null
}
trap cleanup EXIT
docker exec "$container" psql -X -U "$user" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$database\";" >/dev/null
for migration in packages/database/drizzle/*.sql; do
 if [[ "$migration" == */0045_* ]]; then
  docker exec -i "$container" psql -X -U "$user" -d "$database" -v ON_ERROR_STOP=1 < scripts/fixtures/exercise-catalog-before.sql >/dev/null
 fi
 { printf 'BEGIN;\nSET LOCAL search_path TO public;\n'; cat "$migration"; printf '\nCOMMIT;\n'; } |
  docker exec -i "$container" psql -X -U "$user" -d "$database" -v ON_ERROR_STOP=1 >/dev/null
done
docker exec -i "$container" psql -X -U "$user" -d "$database" -v ON_ERROR_STOP=1 < scripts/fixtures/exercise-catalog-after.sql >/dev/null
printf 'Exercise catalog migration: ordering, tombstones, uniqueness and history preservation passed\n'
