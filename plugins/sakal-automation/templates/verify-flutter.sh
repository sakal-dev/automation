#!/usr/bin/env bash
#
# tool/verify.sh — the merge gate (Flutter), in one place.
# The repo's own definition of "checks pass" (sakal-dev/automation,
# docs/task-contract.md): CI runs it, agents must pass it before opening any
# PR, developers run it before pushing. Exit 0 = the change may become a PR.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Self-sufficient PATH: setup.sh installs Flutter into $FLUTTER_HOME but PATH
# exports don't survive across CI steps — resolve here so verify works in any
# step, hook, or agent shell.
FLUTTER_HOME="${FLUTTER_HOME:-$HOME/flutter}"
if ! command -v flutter >/dev/null 2>&1 && [ -x "$FLUTTER_HOME/bin/flutter" ]; then
  export PATH="$FLUTTER_HOME/bin:$PATH"
fi

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }

# 1. Codegen + committed-generated-code sync (only if the repo uses it).
#    Scoped to *.g.dart so an incidental lockfile re-resolution can't turn
#    this into a false failure.
if grep -q build_runner pubspec.yaml; then
  log "dart run build_runner build"
  dart run build_runner build
  log "verify committed *.g.dart in sync"
  if ! git diff --quiet -- '**/*.g.dart'; then
    echo "::error::Generated code is out of date. Run 'dart run build_runner build' and commit the result."
    git --no-pager diff --stat -- '**/*.g.dart'
    exit 1
  fi
fi

# 2. Static analysis — must be clean.
log "flutter analyze"; flutter analyze

# 3. Tests — must be green.
log "flutter test"; flutter test

log "verify.sh: all checks passed"
