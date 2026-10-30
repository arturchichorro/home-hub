#!/usr/bin/env bash
# Creates and drops only its own disposable database; never migrates app data.
set -euo pipefail
cd "$(dirname "$0")/.."
container="${1:?Usage: scripts/verify-exercise-logging-migration.sh <postgres-container>}"
user="${POSTGRES_USER:-home_hub}"
database="exercise_logging_${RANDOM}_$$"
cleanup() { docker exec "$container" psql -X -U "$user" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$database\" WITH (FORCE);" >/dev/null; }
trap cleanup EXIT
docker exec "$container" psql -X -U "$user" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$database\";" >/dev/null
for migration in packages/database/drizzle/*.sql; do
 if [[ "$migration" == */0046_* ]]; then
  docker exec -i "$container" psql -X -U "$user" -d "$database" -v ON_ERROR_STOP=1 < scripts/fixtures/exercise-logging-before.sql >/dev/null
 fi
 { printf 'BEGIN;\nSET LOCAL search_path TO public;\n'; cat "$migration"; printf '\nCOMMIT;\n'; } |
  docker exec -i "$container" psql -X -U "$user" -d "$database" -v ON_ERROR_STOP=1 >/dev/null
done
docker exec -i "$container" psql -X -U "$user" -d "$database" -v ON_ERROR_STOP=1 < scripts/fixtures/exercise-logging-after.sql >/dev/null
printf 'Exercise logging: values, notes, dates, snapshots, deleted slots, separate occurrences, note-only entries, publication and author FKs passed\n'
