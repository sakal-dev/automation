#!/usr/bin/env bash
# Root: raise the firewall (unless explicitly skipped for local dev), then
# drop privileges to the agent user and exec the worker command.
set -euo pipefail

if [ "${SKIP_FIREWALL:-0}" != "1" ]; then
  /usr/local/bin/init-firewall.sh
else
  echo "[entrypoint] SKIP_FIREWALL=1 — egress NOT restricted (local dev only; never on a VPS)"
fi

exec gosu agent "$@"
