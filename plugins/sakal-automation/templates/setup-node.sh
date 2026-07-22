#!/usr/bin/env bash
#
# tool/setup.sh — toolchain + project bootstrap (Node/React/Vue).
# Installed by automation-install; owned by THIS repo afterwards. Idempotent.
# Detects the package manager from the committed lockfile — exactly one
# lockfile should be committed.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }

command -v node >/dev/null || { echo "::error::node not found — install Node LTS"; exit 1; }
log "node $(node --version)"

if   [ -f pnpm-lock.yaml ];      then corepack enable >/dev/null 2>&1 || true; log "pnpm install"; pnpm install --frozen-lockfile
elif [ -f yarn.lock ];           then corepack enable >/dev/null 2>&1 || true; log "yarn install"; yarn install --immutable
elif [ -f package-lock.json ];   then log "npm ci"; npm ci
else echo "::error::No lockfile (pnpm-lock.yaml / yarn.lock / package-lock.json) — commit one; reproducible installs are part of the gate."; exit 1
fi

log "Setup complete. Gate: ./tool/verify.sh"
