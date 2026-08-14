#!/usr/bin/env bash
set -Eeuo pipefail
#!/usr/bin/env bash

set -Eeuo pipefail

umask 077

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
trap 'rm -rf "${temporary_directory}"' EXIT

dump_file="${temporary_directory}/home-hub.dump"

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

"${compose[@]}" exec -T postgres \
  pg_restore --list <"${dump_file}" >/dev/null

rclone copyto \
  "${dump_file}" \
  "backup:${BACKUP_R2_BUCKET}/${remote_path}" \
  --immutable \
  --no-traverse

local_size="$(wc -c <"${dump_file}" | tr -d ' ')"
remote_size="$(
  rclone lsl "backup:${BACKUP_R2_BUCKET}/${remote_path}" --files-only |
    awk 'NR == 1 { print $1 }'
)"

if [[ "${remote_size}" != "${local_size}" ]]; then
  echo "Uploaded backup size does not match the local dump" >&2
  exit 1
fi

echo "Backup uploaded: ${remote_path} (${local_size} bytes)"
