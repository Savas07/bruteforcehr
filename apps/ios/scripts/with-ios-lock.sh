#!/usr/bin/env bash
# Runs a command while holding the machine-wide iOS lock that capture.sh uses
# (/tmp/bfhr-ios-capture.lock), so builds into a shared DerivedData (BFHR_DERIVED_DATA) and
# simulator UI tests never overlap with another worktree's.
#
# Usage: apps/ios/scripts/with-ios-lock.sh xcodebuild test -project … -derivedDataPath "$BFHR_DERIVED_DATA" …
set -euo pipefail

lock_dir="/tmp/bfhr-ios-capture.lock"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

until mkdir "$lock_dir" 2>/dev/null; do
  holder="$(cat "$lock_dir/pid" 2>/dev/null || true)"
  if [[ -n "$holder" ]] && ! kill -0 "$holder" 2>/dev/null; then
    echo "with-ios-lock.sh: removing stale lock of process $holder"
    rm -rf "$lock_dir"
    continue
  fi
  echo "with-ios-lock.sh: waiting for process ${holder:-?} ($(cat "$lock_dir/worktree" 2>/dev/null || echo unknown))…"
  sleep 10
done
echo $$ >"$lock_dir/pid"
echo "$repo_root" >"$lock_dir/worktree"
trap 'rm -rf "$lock_dir"' EXIT

"$@"
