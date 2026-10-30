#!/usr/bin/env bash
# Invoked by deploy-production.sh only after its locked, verified fast-forward.
set -euo pipefail

readonly compose_file="compose.production.yml"
readonly environment_file=".env.production"

docker compose \
  --env-file "$environment_file" \
  -f "$compose_file" \
  --profile tools \
  build api web migrate

# 0046 changes the canonical log writer. Never copy while the old API can write.
# Keep the cutoff aligned with 0046's timestamp in drizzle/meta/_journal.json.
migration_table="$(docker compose --env-file "$environment_file" -f "$compose_file" \
  exec -T postgres psql -X -U home_hub -d home_hub -At -v ON_ERROR_STOP=1 \
  -c "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL;")"
needs_logging_cutover=t
if [[ "$migration_table" == "t" ]]; then
  needs_logging_cutover="$(docker compose --env-file "$environment_file" -f "$compose_file" \
    exec -T postgres psql -X -U home_hub -d home_hub -At -v ON_ERROR_STOP=1 \
    -c 'SELECT NOT EXISTS (SELECT FROM drizzle.__drizzle_migrations WHERE created_at >= 1793354301869);')"
fi
migration_options=(--rm)
if [[ "$needs_logging_cutover" != "f" ]]; then
  docker compose --env-file "$environment_file" -f "$compose_file" stop api zero-cache
  ./scripts/backup-production-postgres.sh
  migration_options+=(-e HOME_HUB_LOGGING_CUTOVER_READY=1)
fi

docker compose \
  --env-file "$environment_file" \
  -f "$compose_file" \
  --profile tools \
  run "${migration_options[@]}" migrate

docker compose \
  --env-file "$environment_file" \
  -f "$compose_file" \
  up -d --no-build --wait api zero-cache

docker compose \
  --env-file "$environment_file" \
  -f "$compose_file" \
  up -d --no-build --wait web

curl --fail --silent --show-error \
  https://home.achichorro.com/api/ready >/dev/null
curl --fail --silent --show-error \
  https://home.achichorro.com/zero/keepalive >/dev/null
curl --fail --silent --show-error \
  https://home.achichorro.com/ >/dev/null

printf 'Deployment completed successfully: %s\n' "$(git rev-parse HEAD)"
