#!/usr/bin/env bash
# Best-effort local evidence only. No networking; never changes an operation's exit code.
set -u
# The provisioned setgid root group grants the capability-dropped collector read access.
umask 027
kind="${1:-}"
case "$kind" in
  deployment_started|deployment_succeeded|deployment_failed|collector_canary) service=deploy ;;
  backup_started|backup_succeeded|backup_failed) service=backup ;;
  *) exit 0 ;;
esac
code="${2:-0}"
[[ "$code" =~ ^[0-9]{1,3}$ ]] || exit 0
revision="${3:-unknown}"
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || revision=unknown
phase="${4:-unknown}"
case "$phase" in
  preflight|build|cutover|migrate|backend|web|health|configuration|dump|archive|upload|verify_upload|unknown) ;;
  *) phase=unknown ;;
esac
file="${HOME_HUB_OPS_LOG_DIRECTORY:-/var/log/home-hub}/events.jsonl"
# An operator provisions this directory; missing/unwritable collection is not an app outage.
[[ -d "$(dirname "$file")" && ! -L "$file" ]] || exit 0
{
  flock -w 0.2 8 || exit 0
  printf '{"timestamp":"%s","service":"%s","event":"%s","exitCode":%s,"revision":"%s","phase":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$service" "$kind" "$code" "$revision" "$phase" >&8
} 8>>"$file" 2>/dev/null || true
exit 0
