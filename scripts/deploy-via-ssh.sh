#!/usr/bin/env bash
set -euo pipefail

deploy() {
  ssh -T \
    -i ~/.ssh/home_hub_deploy \
    -o BatchMode=yes \
    -o ConnectTimeout=15 \
    -o IdentitiesOnly=yes \
    -o ServerAliveCountMax=10 \
    -o ServerAliveInterval=30 \
    -o StrictHostKeyChecking=yes \
    -o UserKnownHostsFile=~/.ssh/known_hosts \
    "${VPS_USER:?VPS_USER is required}@${VPS_HOST:?VPS_HOST is required}"
}

if deploy; then
  exit 0
else
  status=$?
fi

# An old installed entrypoint can pull the release without knowing its new
# cutover sequence. The new migrator refuses that unsafe path before any SQL.
# Reconnect once to execute the now-updated entrypoint, under a fresh lock.
if [[ "$status" != "78" ]]; then
  exit "$status"
fi
echo "Migration preflight refused the old deployment entrypoint; reconnecting once."
deploy
