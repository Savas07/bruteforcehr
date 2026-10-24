#!/usr/bin/env bash
# Runs a command with the Firebase emulators the E2E build talks to (firebase.json `emulators`):
# Auth on 127.0.0.1:9099 (src/features/auth/firebaseAuth.ts, e2e/support/auth.ts), Firestore on
# 8080 and Storage on 9199 (src/lib/firebaseServices.ts), with the repository's security rules.
# Firestore and Storage need Java (CI sets it up; there is no local JDK on the dev machine).
# Starting and stopping them around the command keeps it in one CI step: the Windows runner ends a
# step's processes when the step ends.
#
#   scripts/with-emulators.sh pnpm test:e2e
#   BFHR_EMULATORS=auth,firestore,storage,functions scripts/with-emulators.sh pnpm test:e2e
#
# With `functions` in BFHR_EMULATORS the Cloud Functions are built first (apps/functions/lib) and
# run in the Functions emulator on 5001, so Firestore triggers (e2e/specs/mail.e2e.ts:
# `mailMessageReviewed`) and callables behave as deployed. Secrets stay unset there (the OAuth mail
# providers answer `provider_not_configured`, as in production today).
#
# Uses `firebase` from PATH (CI installs firebase-tools globally first: fetching it through npx
# inside the start-up wait took too long on Windows), else npx.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
log="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/emulators.log"
if command -v firebase >/dev/null; then cli=(firebase); else cli=(npx --yes firebase-tools@15.34.1); fi

# Waits (up to a minute) until no emulator answers on its port any more.
wait_for_free_ports() {
  for _ in $(seq 60); do
    local busy=false
    for port in 9099 8080 9199 5001 4400; do
      if curl -s -o /dev/null "http://127.0.0.1:$port/"; then busy=true; fi
    done
    $busy || return 0
    sleep 1
  done
}
# A previous step's emulators may still be shutting down.
wait_for_free_ports

only="${BFHR_EMULATORS:-auth,firestore,storage}"
with_functions=false
case ",$only," in *,functions,*) with_functions=true ;; esac
if $with_functions; then
  (cd "$repo_root" && pnpm --filter @bfhr/functions run build)
  # Params the emulator would otherwise ask for interactively (functions/src/mail/config.ts).
  printf 'PUBLIC_BASE_URL=https://bruteforcehr.web.app\n' >"$repo_root/apps/functions/lib/default/.env.local"
fi

(cd "$repo_root" && exec "${cli[@]}" emulators:start --only "$only" --project bruteforcehr) >"$log" 2>&1 &
emulator=$!
stop() {
  # npx starts the CLI as a child; end the whole tree at once (on Windows the JVMs outlive a plain
  # kill and keep the ports). taskkill needs the Windows pid, not Git Bash's: given the latter, a
  # surviving CLI shut its emulators down later, i.e. the next step's on the same ports.
  if command -v taskkill >/dev/null; then
    winpid="$(cat "/proc/$emulator/winpid" 2>/dev/null || echo "$emulator")"
    taskkill //F //T //PID "$winpid" >/dev/null 2>&1 || true
  fi
  pkill -P "$emulator" 2>/dev/null || true
  kill "$emulator" 2>/dev/null || true
  wait "$emulator" 2>/dev/null || true
  wait_for_free_ports
}
trap stop EXIT

ready() {
  curl -sf "http://127.0.0.1:9099/" >/dev/null &&
    curl -s -o /dev/null "http://127.0.0.1:8080/" &&
    curl -s -o /dev/null "http://127.0.0.1:9199/" &&
    { ! $with_functions || grep -q "All emulators ready" "$log"; }
}
# Up to 8 minutes: the Windows runner sometimes takes minutes to start the emulators.
for _ in $(seq 240); do
  if ready; then break; fi
  if ! kill -0 "$emulator" 2>/dev/null; then
    cat "$log"
    echo "The emulators exited before they were ready" >&2
    exit 1
  fi
  sleep 2
done
ready || { cat "$log"; echo "The emulators didn't start" >&2; exit 1; }

"$@" || {
  status=$?
  echo "--- emulators.log (last 40 lines) ---" >&2
  tail -n 40 "$log" >&2
  exit "$status"
}
