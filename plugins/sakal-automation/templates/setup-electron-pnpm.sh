#!/usr/bin/env bash
#
# tool/setup.sh — toolchain + project bootstrap (Electron + pnpm workspace).
# Installed by automation-install; owned by THIS repo afterwards. Idempotent.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }

command -v node >/dev/null || { echo "::error::node not found — install Node LTS"; exit 1; }
corepack enable >/dev/null 2>&1 || true
log "node $(node --version) · pnpm $(pnpm --version)"

# Native deps (electron, node-pty, …) need their build scripts approved via
# the allowBuilds map in pnpm-workspace.yaml — that file is the repo's
# decision, not this script's. --frozen-lockfile keeps installs reproducible.
log "pnpm install"
pnpm install --frozen-lockfile

log "Setup complete. Gate: ./tool/verify.sh"
