#!/usr/bin/env bash
# workers/headless-loop/loop.sh — METHOD 4: `claude -p` in a loop.
# One iteration = one full pass through the contract: claim → fresh clone →
# brief → execute → gate → PR/report → release. Runs INSIDE the sandbox
# image (workers/docker) — never bare on a host: the loop uses
# --dangerously-skip-permissions, so the firewall + non-root sandbox are the
# actual permission system.
#
# Mode-blind: the SOURCE switch lives in workers/lib/lifecycle.sh (the
# claim/report seams); nothing else here branches on it. Stack-blind: the
# repo's own tool/setup.sh + tool/verify.sh are the only stack knowledge.
# Config via env — see env.example. AGENT_CMD is overridable for testing
# (the kill test runs a mock agent; CI-less local dev too).
set -euo pipefail

: "${SOURCE:?SOURCE=github|sakalmaster}"; : "${REPO:?REPO=owner/name}"
POLL_SECONDS="${POLL_SECONDS:-300}"
WORKDIR="${WORKDIR:-/workspace/run}"
AGENT_CMD="${AGENT_CMD:-claude -p --dangerously-skip-permissions --max-turns ${MAX_TURNS:-150} --output-format json}"
LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=../lib/lifecycle.sh
source "$LIB/lifecycle.sh"

echo "[loop] source=$SOURCE repo=$REPO poll=${POLL_SECONDS}s"

while true; do
  TASK_REF=""; RUN_ID=""; STORY_KEY=""
  if ! claim; then
    sleep "$POLL_SECONDS"; continue
  fi

  # From claim to finish, EVERY exit path (incl. SIGTERM — docker stop, kill
  # test, systemd restart) releases the claim / reports an outcome. This is
  # the loop's always(). The agent runs in the BACKGROUND under an
  # interruptible `wait` — bash defers traps while a foreground command runs,
  # so a foreground agent would swallow SIGTERM until SIGKILL and the release
  # would never fire (found by the kill test's design).
  outcome="failed"; detail="terminated before outcome"
  trap 'kill "${AGENT_BG:-}" "${HB:-}" 2>/dev/null || true; finish "$outcome" "$detail"; trap - EXIT INT TERM; exit 143' INT TERM
  trap 'kill "${HB:-}" 2>/dev/null || true; finish "$outcome" "$detail"; trap - EXIT' EXIT

  rm -rf "$WORKDIR" && mkdir -p "$WORKDIR"
  echo "[loop] fresh clone of $REPO"
  gh repo clone "$REPO" "$WORKDIR/repo" -- --depth 50 -q
  brief
  cd "$WORKDIR/repo"

  # heartbeat in the background while the agent works (integrated mode no-ops
  # in github mode)
  ( while true; do sleep "${HEARTBEAT_SECONDS:-120}"; heartbeat; done ) & HB=$!

  echo "[loop] agent starts on $TASK_REF"
  set +e
  timeout "${TASK_TIMEOUT_SECONDS:-3600}" bash -c "$AGENT_CMD \"\$(cat "$BRIEF_FILE")\"" & AGENT_BG=$!
  wait "$AGENT_BG"; agent_rc=$?
  set -e
  kill "$HB" 2>/dev/null || true

  # GATE — in the loop's environment, not taken from the agent's claims.
  if [ "$agent_rc" -ne 0 ]; then
    outcome="failed"; detail="agent exited rc=$agent_rc"
  elif ./tool/setup.sh >/dev/null 2>&1 && ./tool/verify.sh; then
    pr=$(gh pr list -R "$REPO" --head "$(git branch --show-current)" --json number -q '.[0].number' 2>/dev/null || true)
    if [ -n "$pr" ]; then outcome="succeeded"; detail="$REPO#$pr"
    else outcome="failed"; detail="gate green but no PR was opened"; fi
  else
    outcome="blocked"; detail="tool/verify.sh failed after the agent's changes — needs a human look"
  fi

  finish "$outcome" "$detail"; trap - EXIT INT TERM
  cd /; rm -rf "$WORKDIR"
  echo "[loop] iteration done: $outcome — next poll in ${POLL_SECONDS}s"
  sleep "$POLL_SECONDS"
done
