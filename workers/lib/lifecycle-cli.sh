#!/usr/bin/env bash
# Thin CLI over lifecycle.sh for non-bash consumers (the SDK worker). One
# lifecycle implementation, two doors — loop.sh sources the functions;
# everything else calls this. Prints JSON on stdout.
#   lifecycle-cli.sh claim            → {"claimed":bool, "task_ref":…, "run_id":…, "story_key":…}
#   lifecycle-cli.sh brief            → {"brief_file":…}   (needs TASK_REF/RUN_ID/STORY_KEY env)
#   lifecycle-cli.sh heartbeat        → {}
#   lifecycle-cli.sh finish <outcome> [detail]
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lifecycle.sh"

cmd="${1:?claim|brief|heartbeat|finish}"; shift || true
case "$cmd" in
  claim)
    if claim; then
      jq -cn --arg t "$TASK_REF" --arg r "${RUN_ID:-}" --arg s "${STORY_KEY:-}" \
        '{claimed:true, task_ref:$t, run_id:$r, story_key:$s}'
    else
      jq -cn '{claimed:false}'
    fi ;;
  brief)
    TASK_REF="${TASK_REF:?}" ; brief
    jq -cn --arg f "$BRIEF_FILE" '{brief_file:$f}' ;;
  heartbeat)
    heartbeat; echo '{}' ;;
  finish)
    finish "${1:?outcome}" "${2:-}"; echo '{}' ;;
  *) echo "unknown command: $cmd" >&2; exit 2 ;;
esac
