#!/usr/bin/env bash
#
# tool/setup.sh — toolchain + project bootstrap (Flutter).
# Installed by automation-install; owned by THIS repo afterwards. Single source
# of truth for "make this repo buildable": the Claude Code SessionStart hook,
# CI (via the shared setup-project action), and fresh developer machines all
# run this. Idempotent; fails loudly.
#
# Env knobs:
#   FLUTTER_HOME   where to install Flutter        (default: $HOME/flutter)
#   SKIP_CODEGEN   set to 1 to skip build_runner   (default: run when present)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FLUTTER_HOME="${FLUTTER_HOME:-$HOME/flutter}"

# Pinned Flutter framework revision — keep in sync with .metadata `revision`.
# <<FLUTTER_REV: automation-install fills this from the repo's .metadata>>
FLUTTER_REV="<FLUTTER_REV>"

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }

# ── 1. Flutter SDK (install if absent, pin) ─────────────────────────────────
if [ ! -x "$FLUTTER_HOME/bin/flutter" ]; then
  log "Installing Flutter into $FLUTTER_HOME (pinned $FLUTTER_REV)"
  git clone https://github.com/flutter/flutter.git --filter=blob:none -b stable "$FLUTTER_HOME"
  git -C "$FLUTTER_HOME" checkout "$FLUTTER_REV"
elif [ "$(git -C "$FLUTTER_HOME" rev-parse HEAD)" != "$FLUTTER_REV" ]; then
  log "Re-pinning existing Flutter to $FLUTTER_REV"
  git -C "$FLUTTER_HOME" fetch --filter=blob:none origin stable
  git -C "$FLUTTER_HOME" checkout "$FLUTTER_REV"
fi

export PATH="$FLUTTER_HOME/bin:$PATH"
# In GitHub Actions a PATH export dies with this process — persist the
# toolchain for the steps that FOLLOW setup (the agent, tool/verify.sh).
if [ -n "${GITHUB_PATH:-}" ]; then
  echo "$FLUTTER_HOME/bin" >> "$GITHUB_PATH"
fi
# Silence first-run prompts so non-interactive runs don't hang on stdin.
flutter --disable-analytics >/dev/null 2>&1 || true
git config --global --add safe.directory "$FLUTTER_HOME" || true

log "Flutter version"; flutter --version

# ── 2. Packages ─────────────────────────────────────────────────────────────
cd "$REPO_ROOT"
log "flutter pub get"; flutter pub get

# ── 3. Codegen (only if the repo uses build_runner) ─────────────────────────
if [ "${SKIP_CODEGEN:-0}" != "1" ] && grep -q build_runner pubspec.yaml; then
  log "dart run build_runner build"; dart run build_runner build
fi

log "Setup complete. Gate: ./tool/verify.sh"
