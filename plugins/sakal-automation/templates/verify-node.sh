#!/usr/bin/env bash
#
# tool/verify.sh — the merge gate (Node/React/Vue), in one place.
# Runs the repo's own package scripts — lint, typecheck, test, build — each
# only if defined. At least ONE of lint/typecheck/test must exist: a repo
# with no runnable checks has no gate, and the gate is the contract.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }

# Package-manager run prefix, from the committed lockfile.
if   [ -f pnpm-lock.yaml ];    then RUN="pnpm run"
elif [ -f yarn.lock ];         then RUN="yarn"
else                                RUN="npm run"
fi

has_script() { node -e "process.exit(((require('./package.json').scripts||{})['$1'])?0:1)"; }

ran=0
for s in lint typecheck test; do
  if has_script "$s"; then log "$RUN $s"; $RUN "$s"; ran=1; fi
done
if [ "$ran" = "0" ]; then
  echo "::error::package.json defines none of lint/typecheck/test — add at least one; a repo without checks has no gate."
  exit 1
fi

# Build must at least compile when the repo has a build.
if has_script build; then log "$RUN build"; $RUN build; fi

log "verify.sh: all checks passed"
