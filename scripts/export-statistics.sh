#!/usr/bin/env bash
set -Eeuo pipefail

umask 077
app_directory="${HOME_HUB_APP_DIR:-/opt/home-hub}"
environment_file="${HOME_HUB_PRODUCTION_ENV_FILE:-${app_directory}/.env.production}"
compose_file="${HOME_HUB_COMPOSE_FILE:-${app_directory}/compose.production.yml}"
output=""
arguments=()

while (($#)); do
  case "$1" in
    --out)
      if [[ -n "$output" || $# -lt 2 || -z "$2" || "$2" == --* ]]; then
        echo "Provide --out FILE exactly once." >&2
        exit 1
      fi
      output="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 --household-id UUID --out FILE [--training-user USERNAME] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--time-zone ZONE]"
      echo "Manual, read-only JSON export. Current members only; no notes/secrets; no overwriting."
      exit 0
      ;;
    *)
      arguments+=("$1")
      shift
      ;;
  esac
done

if [[ -z "$output" || -e "$output" || -L "$output" ]]; then
  echo "Provide a new output file with --out; existing paths are never replaced." >&2
  exit 1
fi

output_directory="$(cd -- "$(dirname -- "$output")" && pwd -P)"
output_name="$(basename -- "$output")"

# One disposable process, not a service/deployment. Use the operator's UID so
# private output belongs to that operator, not root or the application's UID.
docker compose --env-file "$environment_file" -f "$compose_file" \
  run --rm --no-deps -T --user "$(id -u):$(id -g)" \
  --volume "${output_directory}:/export:rw" api \
  node --import tsx src/statistics/cli.ts \
  "${arguments[@]}" --out "/export/${output_name}"
