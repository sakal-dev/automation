#!/usr/bin/env bash
#
# tool/setup.sh — toolchain + project bootstrap (Laravel/PHP).
# Installed by automation-install; owned by THIS repo afterwards. Idempotent.
# Assumes PHP + Composer are on the machine (GitHub ubuntu runners ship both);
# fails loudly with guidance if not.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }

command -v php >/dev/null      || { echo "::error::php not found — install PHP >= 8.2"; exit 1; }
command -v composer >/dev/null || { echo "::error::composer not found — https://getcomposer.org"; exit 1; }
log "php $(php -r 'echo PHP_VERSION;') · $(composer --version --no-ansi)"

log "composer install"
composer install --no-interaction --prefer-dist --no-progress

# Frontend deps only when the repo has them (Vite/Mix assets).
if [ -f package.json ]; then
  if [ -f pnpm-lock.yaml ]; then corepack enable >/dev/null 2>&1 || true; log "pnpm install"; pnpm install --frozen-lockfile
  elif [ -f package-lock.json ]; then log "npm ci"; npm ci
  fi
fi

# Test env: Laravel's phpunit.xml normally provides it; ensure an app key
# exists for artisan-dependent tests without touching real .env files.
if [ -f artisan ] && [ ! -f .env ] && [ -f .env.example ]; then
  log "seed .env from .env.example (local/test only; never committed)"
  cp .env.example .env && php artisan key:generate --ansi
fi

log "Setup complete. Gate: ./tool/verify.sh"
