#!/usr/bin/env bash
# Runs a command with the Firebase emulators the E2E build talks to (firebase.json `emulators`):
# Auth on 127.0.0.1:9099 (src/features/auth/firebaseAuth.ts, e2e/support/auth.ts), Firestore on
# 8080 and Storage on 9199 (src/lib/firebaseServices.ts), with the repository's security rules.
# Firestore and Storage need Java (CI sets it up; there is no local JDK on the dev machine).
# Starting and stopping them around the command keeps it in one CI step: the Windows runner ends a
# step's processes when the step ends.
#
#   scripts/with-emulators.sh pnpm test:e2e
#
# Uses `firebase` from PATH (CI installs firebase-tools globally first: fetching it through npx
# inside the start-up wait took too long on Windows), else npx.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
log="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/emulators.log"
if command -v firebase >/dev/null; then cli=(firebase); else cli=(npx --yes firebase-tools@15.34.1); fi

(cd "$repo_root" && exec "${cli[@]}" emulators:start --only auth,firestore,storage --project bruteforcehr) >"$log" 2>&1 &
emulator=$!
stop() {
  # npx starts the CLI as a child; end the whole group.
  pkill -P "$emulator" 2>/dev/null || true
  kill "$emulator" 2>/dev/null || true
}
trap stop EXIT

ready() {
  curl -sf "http://127.0.0.1:9099/" >/dev/null &&
    curl -s -o /dev/null "http://127.0.0.1:8080/" &&
    curl -s -o /dev/null "http://127.0.0.1:9199/"
}
for _ in $(seq 120); do
  if ready; then break; fi
  if ! kill -0 "$emulator" 2>/dev/null; then
    cat "$log"
    echo "The emulators exited before they were ready" >&2
    exit 1
  fi
  sleep 2
done
ready || { cat "$log"; echo "The emulators didn't start" >&2; exit 1; }

"$@"
