#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

event_writer="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/record-ops-event.sh"
temporary_directory=""
phase=configuration
bash "$event_writer" backup_started 0 2>/dev/null || true
finish_backup() {
  local status=$?
  trap - EXIT
  [[ -z "$temporary_directory" ]] || rm -rf "$temporary_directory" || true
  local event=backup_failed
  [[ "$status" == 0 ]] && event=backup_succeeded
  bash "$event_writer" "$event" "$status" unknown "$phase" 2>/dev/null || true
  exit "$status"
}
trap finish_backup EXIT

app_directory="${HOME_HUB_APP_DIR:-/opt/home-hub}"
backup_environment_file="${HOME_HUB_BACKUP_ENV_FILE:-${app_directory}/.env.backup}"
production_environment_file="${HOME_HUB_PRODUCTION_ENV_FILE:-${app_directory}/.env.production}"
compose_file="${HOME_HUB_COMPOSE_FILE:-${app_directory}/compose.production.yml}"

if [[ ! -r "${backup_environment_file}" ]]; then
  echo "Backup environment file is not readable: ${backup_environment_file}" >&2
  exit 1
fi

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

compose=(
  docker compose
  --env-file "${production_environment_file}"
  -f "${compose_file}"
)

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
year="${timestamp:0:4}"
month="${timestamp:4:2}"
remote_path="postgres/${year}/${month}/home-hub-${timestamp}.dump"

temporary_directory="$(mktemp -d)"

dump_file="${temporary_directory}/home-hub.dump"

phase=dump
"${compose[@]}" exec -T postgres \
  pg_dump \
  --username home_hub \
  --dbname home_hub \
  --format custom \
  --no-owner \
  >"${dump_file}"

if [[ ! -s "${dump_file}" ]]; then
  echo "PostgreSQL produced an empty backup" >&2
  exit 1
fi

phase=archive
"${compose[@]}" exec -T postgres \
  pg_restore --list <"${dump_file}" >/dev/null

phase=upload
rclone copyto \
  "${dump_file}" \
  "backup:${BACKUP_R2_BUCKET}/${remote_path}" \
  --immutable \
  --no-traverse \
  --s3-no-head

local_size="$(wc -c <"${dump_file}" | tr -d ' ')"

phase=verify_upload
if ! rclone cat "backup:${BACKUP_R2_BUCKET}/${remote_path}" |
  cmp --silent "${dump_file}" -; then
  echo "Uploaded backup does not match the local dump" >&2
  exit 1
fi

echo "Backup uploaded: ${remote_path} (${local_size} bytes)"
