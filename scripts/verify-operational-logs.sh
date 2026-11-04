#!/usr/bin/env bash
# Only disposable containers, synthetic logs, isolated storage and fake credentials.
set -euo pipefail
cd "$(dirname "$0")/.."
repo="$PWD"
work="$(mktemp -d)"
name="hh-log-verification-${RANDOM}-$$"
cleanup() {
  local status=$?
  if [[ "$status" != 0 ]]; then
    docker inspect --format '{{.Name}} {{json .State}}' "$name-alloy" "$name-loki" 2>/dev/null || true
    docker logs --tail 30 "$name-loki" 2>&1 || true
    docker logs --tail 30 "$name-alloy" 2>&1 || true
  fi
  docker rm -fv "$name-alloy" "$name-loki" >/dev/null 2>&1 || true
  docker network rm "$name" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT
mkdir -p "$work/bin"
(cd apps/api && node --import tsx "$repo/apps/ops/test/pipeline.ts" seed "$work")
# Fake fixture files only: permit a capability-dropped container to traverse/read
# host-owned files, and permit the mock host writer to append synthetic events.
chmod 755 "$work"
chmod 666 "$work/operations/events.jsonl"
cat >"$work/bin/git" <<'MOCK'
#!/bin/sh
printf '%s\n' aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
MOCK
cat >"$work/bin/curl" <<'MOCK'
#!/bin/sh
exit 0
MOCK
cat >"$work/bin/docker" <<'MOCK'
#!/bin/sh
case "$*" in
  *to_regclass*) echo t ;;
  *'SELECT NOT EXISTS'*) echo f ;;
  *'run --rm migrate'*) exit "${FIXTURE_MIGRATION_EXIT:-0}" ;;
  *pg_dump*) printf 'synthetic-dump' ;;
  *pg_restore*) cat >/dev/null ;;
esac
MOCK
cat >"$work/bin/rclone" <<'MOCK'
#!/bin/sh
if [ "$1" = cat ]; then printf 'synthetic-dump'; fi
MOCK
chmod +x "$work/bin/"*
printf 'BACKUP_R2_ENDPOINT=fixture\nBACKUP_R2_ACCESS_KEY_ID=fixture\nBACKUP_R2_SECRET_ACCESS_KEY=fixture\nBACKUP_R2_BUCKET=fixture\n' >"$work/backup.env"
docker network create "$name" >/dev/null
docker run -d --name "$name-loki" --network "$name" --network-alias loki --memory=512m --cpus=1 \
  --tmpfs /tmp/loki:rw,size=64m,mode=1777 \
  -p 127.0.0.1::3100 -v "$repo/apps/ops/test/loki.yaml:/etc/loki/fixture.yaml:ro" \
  grafana/loki:3.7.9 -config.file=/etc/loki/fixture.yaml >/dev/null
port="$(docker port "$name-loki" 3100/tcp | awk -F: '{print $NF}')"
ready=false
for _ in {1..60}; do
  if curl -fsS "http://127.0.0.1:$port/ready" >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || { docker logs "$name-loki"; exit 1; }
docker run --rm -v "$repo/deploy/observability:/etc/alloy:ro" \
  -e LOKI_WRITE_URL=http://loki:3100/loki/api/v1/push -e LOKI_TENANT=1 -e LOKI_WRITE_TOKEN=fixture \
  grafana/alloy:v1.21.0 validate /etc/alloy/config.alloy
docker run -d --name "$name-alloy" --network "$name" --memory=256m --cpus=0.25 \
  --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit=64 \
  --tmpfs /tmp:rw,size=16m,mode=1777 -p 127.0.0.1::12345 \
  -e LOKI_WRITE_URL=http://loki:3100/loki/api/v1/push -e LOKI_TENANT=1 -e LOKI_WRITE_TOKEN=fixture \
  -v "$repo/deploy/observability:/etc/alloy:ro" -v "$work/docker:/docker-logs:ro" \
  -v "$work/operations:/operations" -v "$repo/scripts:/workspace/scripts:ro" -v "$work:/fixture:ro" \
  grafana/alloy:v1.21.0 run --disable-reporting --server.http.listen-addr=0.0.0.0:12345 --storage.path=/tmp/alloy /etc/alloy/config.alloy >/dev/null
# Exercise actual release/backup EXIT traps, replacing only external side effects.
run_fixture() {
  docker exec -w /workspace -e PATH=/fixture/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    -e HOME_HUB_OPS_LOG_DIRECTORY=/operations "$@"
}
run_fixture "$name-alloy" bash scripts/deploy-release.sh >/dev/null
if run_fixture -e FIXTURE_MIGRATION_EXIT=37 "$name-alloy" bash scripts/deploy-release.sh >/dev/null; then echo 'Expected migration failure' >&2; exit 1; else [[ "$?" == 37 ]]; fi
run_fixture -e HOME_HUB_BACKUP_ENV_FILE=/fixture/backup.env "$name-alloy" bash scripts/backup-production-postgres.sh >/dev/null
if run_fixture -e HOME_HUB_BACKUP_ENV_FILE=/missing "$name-alloy" bash scripts/backup-production-postgres.sh >/dev/null 2>&1; then echo 'Expected backup failure' >&2; exit 1; fi
run_fixture "$name-alloy" bash scripts/record-ops-event.sh collector_canary
sleep 6
node apps/ops/test/pipeline.ts verify "$work" "$port" || { docker logs "$name-alloy"; exit 1; }
metrics_port="$(docker port "$name-alloy" 12345/tcp | awk -F: '{print $NF}')"
node apps/ops/test/pipeline.ts flood "$work"
sleep 6
node apps/ops/test/pipeline.ts verify_flood "$work" "$port" "$metrics_port"
docker stats --no-stream --format '{{.Name}}: {{.MemUsage}} / {{.CPUPerc}}' "$name-alloy" "$name-loki"
echo 'Real Alloy → Loki → read-only MCP citation, pre-export privacy, filtering, truncation and operation outcomes passed.'
