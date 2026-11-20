#!/usr/bin/env bash
# Manual only: owned disposable containers, synthetic records and fake credentials.
set -euo pipefail
cd "$(dirname "$0")/.."
repo="$PWD"
work="$(mktemp -d)"
name="hh-log-verification-${RANDOM}-$$"
cleanup() {
  local status=$?
  if [[ "$status" != 0 ]]; then
    docker logs --tail 30 "$name-alloy" 2>&1 || true
    docker logs --tail 15 "$name-loki" 2>&1 || true
  fi
  for container in "$name-driver" "$name-alloy" "$name-loki"; do
    if [[ "$(docker inspect --format '{{index .Config.Labels "home-hub-fixture"}}' "$container" 2>/dev/null || true)" == "$name" ]]; then
      docker rm -fv "$container" >/dev/null
    fi
  done
  docker network rm "$name" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT
mkdir -p "$work/bin"
(cd apps/api && node --import tsx test/observability-pipeline.ts seed "$work")
chmod 755 "$work"
chmod 777 "$work/operations"
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
docker network create --label home-hub-fixture="$name" "$name" >/dev/null
docker run -d --name "$name-loki" --label home-hub-fixture="$name" --network "$name" --network-alias loki --memory=512m --cpus=1 \
  --tmpfs /tmp/loki:rw,size=64m,mode=1777 -p 127.0.0.1::3100 \
  -v "$repo/deploy/observability/test/loki.yaml:/etc/loki/fixture.yaml:ro" \
  grafana/loki:3.7.9 -config.file=/etc/loki/fixture.yaml >/dev/null
port="$(docker port "$name-loki" 3100/tcp | awk -F: '{print $NF}')"
ready=false
for _ in {1..60}; do
  if curl -fsS "http://127.0.0.1:$port/ready" >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || exit 1
docker run --rm --user 10001:10001 --read-only --cap-drop ALL \
  -v "$repo/deploy/observability:/etc/alloy:ro" \
  -e LOKI_WRITE_URL=http://loki:3100/loki/api/v1/push -e LOKI_TENANT=1 -e LOKI_WRITE_TOKEN=fixture \
  grafana/alloy:v1.21.0 validate /etc/alloy/config.alloy
docker run -d --name "$name-alloy" --label home-hub-fixture="$name" --network "$name" \
  --user 10001:10001 --memory=256m --cpus=0.25 --read-only --cap-drop ALL \
  --security-opt no-new-privileges --pids-limit=64 \
  --tmpfs /tmp:rw,size=16m,mode=1777 --tmpfs /data:rw,size=16m,uid=10001,gid=10001 \
  -p 127.0.0.1::12345 -p 127.0.0.1::1514/udp \
  -e LOKI_WRITE_URL=http://loki:3100/loki/api/v1/push -e LOKI_TENANT=1 -e LOKI_WRITE_TOKEN=fixture \
  -v "$repo/deploy/observability:/etc/alloy:ro" -v "$work/operations:/operations:ro" \
  grafana/alloy:v1.21.0 run --disable-reporting --server.http.listen-addr=0.0.0.0:12345 --storage.path=/data /etc/alloy/config.alloy >/dev/null
metrics="$(docker port "$name-alloy" 12345/tcp | awk -F: '{print $NF}')"
udp="$(docker port "$name-alloy" 1514/udp | awk -F: '{print $NF}')"
ready=false
for _ in {1..30}; do
  if curl -fsS "http://127.0.0.1:$metrics/-/ready" >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || exit 1
# External build/SQL/backup effects are mocks; the actual shell traps run.
# Docker Desktop daemon loopback is not the macOS published loopback. Use the
# isolated receiver IP for this driver probe; production Linux uses loopback.
driver_receiver="$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$name-alloy")"
docker run --name "$name-driver" --label home-hub-fixture="$name" \
  --log-driver=syslog --log-opt syslog-address="udp://$driver_receiver:1514" \
  --log-opt syslog-format=rfc5424micro --log-opt tag=hh-api \
  --log-opt mode=non-blocking --log-opt cache-max-size=10m --log-opt cache-max-file=3 \
  --user 10001:10001 --entrypoint /bin/sh -v "$work/driver.json:/fixture.json:ro" \
  grafana/alloy:v1.21.0 -c 'cat /fixture.json' >/dev/null
docker logs "$name-driver" 2>&1 | grep -q 'http_request'
# A separate helper runs only fake fixture commands, not the collector or real Docker.
run_shell() {
  docker run --rm --label home-hub-fixture="$name" --user 10001:10001 --read-only --cap-drop ALL \
    --tmpfs /tmp:rw,size=16m,mode=1777 \
    --entrypoint /bin/bash -w /workspace -v "$repo/scripts:/workspace/scripts:ro" -v "$work:/fixture" \
    -e PATH=/fixture/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    -e HOME_HUB_OPS_LOG_DIRECTORY=/fixture/operations "$@"
}
run_shell grafana/alloy:v1.21.0 scripts/deploy-release.sh >/dev/null
if run_shell -e FIXTURE_MIGRATION_EXIT=37 grafana/alloy:v1.21.0 scripts/deploy-release.sh >/dev/null; then exit 1; else [[ "$?" == 37 ]]; fi
run_shell -e HOME_HUB_BACKUP_ENV_FILE=/fixture/backup.env grafana/alloy:v1.21.0 scripts/backup-production-postgres.sh >/dev/null
if run_shell -e HOME_HUB_BACKUP_ENV_FILE=/missing grafana/alloy:v1.21.0 scripts/backup-production-postgres.sh >/dev/null 2>&1; then exit 1; fi
(cd apps/api && node --import tsx test/observability-pipeline.ts send "$work" "$udp")
sleep 6
(cd apps/api && node --import tsx test/observability-pipeline.ts verify "$work" "$port")
(cd apps/api && node --import tsx test/observability-pipeline.ts flood "$work" "$udp")
sleep 6
(cd apps/api && node --import tsx test/observability-pipeline.ts verify_flood "$work" "$port" "$metrics")
if [[ -f apps/ops/test/pipeline.ts ]]; then
  node apps/ops/test/pipeline.ts "$work" "$port"
fi
docker stats --no-stream --format '{{.Name}}: {{.MemUsage}} / {{.CPUPerc}}' "$name-alloy" "$name-loki"
echo 'Manual non-root UDP pipeline passed; no production resources or credentials used.'
