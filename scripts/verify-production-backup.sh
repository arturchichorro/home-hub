#!/usr/bin/env bash

set -Eeuo pipefail

umask 077

app_directory="${HOME_HUB_APP_DIR:-/opt/home-hub}"
backup_environment_file="${HOME_HUB_BACKUP_ENV_FILE:-${app_directory}/.env.backup}"

if [[ ! -r "${backup_environment_file}" ]]; then
  echo "Backup environment file is not readable: ${backup_environment_file}" >&2
  exit 1
fi

for command_name in docker openssl rclone; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command is not installed: ${command_name}" >&2
    exit 1
  fi
done

set -a
# shellcheck disable=SC1090
source "${backup_environment_file}"
set +a

required_variables=(
  BACKUP_R2_ENDPOINT
  BACKUP_R2_ACCESS_KEY_ID
  BACKUP_R2_SECRET_ACCESS_KEY
  BACKUP_R2_BUCKET
)

for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    echo "Missing required backup variable: ${variable_name}" >&2
    exit 1
  fi
done

export RCLONE_CONFIG_BACKUP_TYPE=s3
export RCLONE_CONFIG_BACKUP_PROVIDER=Cloudflare
export RCLONE_CONFIG_BACKUP_REGION=auto
export RCLONE_CONFIG_BACKUP_ENDPOINT="${BACKUP_R2_ENDPOINT}"
export RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID="${BACKUP_R2_ACCESS_KEY_ID}"
export RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY="${BACKUP_R2_SECRET_ACCESS_KEY}"
export RCLONE_CONFIG_BACKUP_NO_CHECK_BUCKET=true
export RCLONE_CONFIG=/dev/null

remote_path="${1:-}"

if [[ -z "${remote_path}" ]]; then
  latest_relative_path="$(
    rclone lsf "backup:${BACKUP_R2_BUCKET}/postgres" \
      --files-only \
      --recursive |
      sort |
      tail -n 1
  )"

  if [[ -z "${latest_relative_path}" ]]; then
    echo "No PostgreSQL backups were found" >&2
    exit 1
  fi

  remote_path="postgres/${latest_relative_path}"
fi

if [[ "${remote_path}" != postgres/* || "${remote_path}" == *".."* ]]; then
  echo "Backup path must be below the postgres/ prefix" >&2
  exit 1
fi

temporary_directory="$(mktemp -d)"
container_name="home-hub-restore-test-$$"
container_started=false

cleanup() {
  if [[ "${container_started}" == true ]]; then
    docker rm --force "${container_name}" >/dev/null 2>&1 || true
  fi

  rm -rf "${temporary_directory}"
}

trap cleanup EXIT

dump_file="${temporary_directory}/home-hub.dump"

rclone cat "backup:${BACKUP_R2_BUCKET}/${remote_path}" >"${dump_file}"

if [[ ! -s "${dump_file}" ]]; then
  echo "Downloaded backup is empty" >&2
  exit 1
fi

restore_password="$(openssl rand -hex 24)"

docker run \
  --detach \
  --rm \
  --name "${container_name}" \
  --network none \
  --tmpfs /var/lib/postgresql/data:rw,noexec,nosuid,size=512m \
  --env "POSTGRES_PASSWORD=${restore_password}" \
  postgres:17 >/dev/null
container_started=true

database_ready=false
for _ in {1..30}; do
  if docker exec "${container_name}" \
    pg_isready --username postgres --dbname postgres >/dev/null 2>&1; then
    database_ready=true
    break
  fi

  sleep 1
done

if [[ "${database_ready}" != true ]]; then
  echo "Disposable PostgreSQL did not become ready" >&2
  exit 1
fi

docker exec -i "${container_name}" \
  pg_restore --list <"${dump_file}" >/dev/null

docker exec "${container_name}" \
  createdb --username postgres home_hub_restore

docker exec -i "${container_name}" \
  pg_restore \
  --username postgres \
  --dbname home_hub_restore \
  --no-owner \
  --exit-on-error \
  <"${dump_file}"

table_count="$(
  docker exec "${container_name}" \
    psql \
    --username postgres \
    --dbname home_hub_restore \
    --tuples-only \
    --no-align \
    --command \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"
)"

migration_count="$(
  docker exec "${container_name}" \
    psql \
    --username postgres \
    --dbname home_hub_restore \
    --tuples-only \
    --no-align \
    --command "SELECT count(*) FROM drizzle.__drizzle_migrations;"
)"

publication_table_count="$(
  docker exec "${container_name}" \
    psql \
    --username postgres \
    --dbname home_hub_restore \
    --tuples-only \
    --no-align \
    --command \
    "SELECT count(*) FROM pg_publication_tables WHERE pubname = 'home_hub_zero';"
)"

if ((table_count == 0 || migration_count == 0 || publication_table_count == 0)); then
  echo "Restored backup is missing required database state" >&2
  exit 1
fi

echo "Backup restored successfully: ${remote_path}"
echo "Application tables: ${table_count}"
echo "Applied migrations: ${migration_count}"
echo "Zero publication tables: ${publication_table_count}"
