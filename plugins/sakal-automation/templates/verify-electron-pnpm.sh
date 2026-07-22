#!/usr/bin/env bash
#
# tool/verify.sh — the merge gate (Electron + pnpm workspace), in one place.
# Runs the workspace's own scripts — lint, typecheck, test, build — each only
# if defined at the root. At least one of lint/typecheck/test must exist.
# (Monorepos: keep root scripts that fan out, e.g. via turbo — the gate calls
# the root; the root owns the fan-out.)
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }

corepack enable >/dev/null 2>&1 || true
has_script() { node -e "process.exit(((require('./package.json').scripts||{})['$1'])?0:1)"; }

ran=0
for s in lint typecheck test; do
  if has_script "$s"; then log "pnpm run $s"; pnpm run "$s"; ran=1; fi
done
if [ "$ran" = "0" ]; then
  echo "::error::package.json defines none of lint/typecheck/test — add at least one; a repo without checks has no gate."
  exit 1
fi

if has_script build; then log "pnpm run build"; pnpm run build; fi

log "verify.sh: all checks passed"
