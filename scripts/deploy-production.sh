#!/usr/bin/env bash

set -euo pipefail

readonly repository_directory="/opt/home-hub"
readonly lock_file="/tmp/home-hub-production-deploy.lock"
readonly compose_file="compose.production.yml"
readonly environment_file=".env.production"

cd "$repository_directory"

exec 9>"$lock_file"
if ! flock -n 9; then
  echo "Another Home Hub deployment is already running." >&2
  exit 1
fi

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Automatic deployment requires the production checkout to be on main." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Automatic deployment requires a clean production checkout." >&2
  git status --short >&2
  exit 1
fi

git fetch origin main

if ! git merge-base --is-ancestor HEAD origin/main; then
  echo "The production checkout cannot fast-forward to origin/main." >&2
  exit 1
fi

./scripts/backup-production-postgres.sh

git pull --ff-only origin main

docker compose \
  --env-file "$environment_file" \
  -f "$compose_file" \
  --profile tools \
  build api web migrate

docker compose \
  --env-file "$environment_file" \
  -f "$compose_file" \
  --profile tools \
  run --rm migrate

docker compose \
  --env-file "$environment_file" \
  -f "$compose_file" \
  up -d --no-build --wait

curl --fail --silent --show-error \
  https://home.achichorro.com/api/ready >/dev/null
curl --fail --silent --show-error \
  https://home.achichorro.com/zero/keepalive >/dev/null
curl --fail --silent --show-error \
  https://home.achichorro.com/ >/dev/null

printf 'Deployment completed successfully: %s\n' "$(git rev-parse HEAD)"
