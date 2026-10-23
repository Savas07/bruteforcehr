#!/usr/bin/env bash
# Runs a command with the Firebase Auth emulator on 127.0.0.1:9099, which E2E builds sign in
# against (src/features/auth/firebaseAuth.ts, e2e/support/auth.ts). The Auth emulator runs on
# Node (no Java). Starting and stopping it around the command keeps it in one CI step: the Windows
# runner ends a step's processes when the step ends.
#
#   scripts/with-auth-emulator.sh pnpm test:e2e
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
log="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/auth-emulator.log"

(cd "$repo_root" && exec npx --yes firebase-tools@15.34.1 emulators:start --only auth --project bruteforcehr) \
  >"$log" 2>&1 &
emulator=$!
stop() {
  # npx starts the CLI as a child; end the whole group.
  pkill -P "$emulator" 2>/dev/null || true
  kill "$emulator" 2>/dev/null || true
}
trap stop EXIT

for _ in $(seq 90); do
  if curl -sf "http://127.0.0.1:9099/" >/dev/null; then break; fi
  if ! kill -0 "$emulator" 2>/dev/null; then
    cat "$log"
    echo "The Auth emulator exited before it was ready" >&2
    exit 1
  fi
  sleep 2
done
curl -sf "http://127.0.0.1:9099/" >/dev/null || { cat "$log"; echo "The Auth emulator didn't start" >&2; exit 1; }

"$@"
