#!/usr/bin/env bash
#
# tool/verify.sh — the merge gate (Laravel/PHP), in one place.
# Runs every check the repo actually has, in order; exit 0 = the change may
# become a PR. Checks are presence-conditional so one template serves plain
# and asset-bearing Laravel repos alike — but at least the test suite MUST
# exist and pass.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }

# 1. Code style (Pint), if the repo ships it.
if [ -x vendor/bin/pint ]; then log "pint --test"; vendor/bin/pint --test; fi

# 2. Static analysis (PHPStan/Larastan), if configured.
if [ -x vendor/bin/phpstan ]; then log "phpstan analyse"; vendor/bin/phpstan analyse --no-progress; fi

# 3. Tests — required. artisan test if Laravel, bare phpunit otherwise.
if [ -f artisan ]; then
  log "php artisan test"; php artisan test
elif [ -x vendor/bin/phpunit ]; then
  log "phpunit"; vendor/bin/phpunit
else
  echo "::error::No test runner found (artisan/phpunit). A repo without a runnable test suite has no gate — add one before queueing agent work."
  exit 1
fi

# 4. Frontend build must at least compile, when assets exist.
if [ -f package.json ] && grep -q '"build"' package.json; then
  if [ -f pnpm-lock.yaml ]; then log "pnpm build"; pnpm run build
  else log "npm run build"; npm run build; fi
fi

log "verify.sh: all checks passed"
