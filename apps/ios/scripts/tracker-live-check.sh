#!/usr/bin/env bash
# Live check of Today and the Tracker against project `bruteforcehr` with a throwaway user
# (docs/design/foundation-ios.md, "Live data: Today and the Tracker"):
#   sign in by email link → Today first run → Log an application → interview round + prep
#   reminder (explainer) → reminder → swipe move + Undo → calendar → Today → read the documents
#   back through the Firestore REST API → delete them and the user.
# Needs gcloud (logged in) and a Debug build in BFHR_DERIVED_DATA. Run inside the iOS lock:
#   BFHR_DERIVED_DATA=… apps/ios/scripts/with-ios-lock.sh apps/ios/scripts/tracker-live-check.sh [device]
set -euo pipefail

ios_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$(cd "$ios_dir/../.." && pwd)"
device="${1:-iPhone 17 Pro}"
project=bruteforcehr
email="bfhr-iostracker-e2e-$(date +%s)@example.com"
out="$repo_root/artifacts/screens/ios/tracker-live"
mkdir -p "$out"
token="$(gcloud auth print-access-token)"
api() { curl -sS -H "Authorization: Bearer $token" -H "x-goog-user-project: $project" -H 'Content-Type: application/json' "$@"; }
docs="https://firestore.googleapis.com/v1/projects/$project/databases/(default)/documents"

run_test() {
  xcodebuild test-without-building -project "$ios_dir/BruteForceHR.xcodeproj" -scheme BruteForceHR -derivedDataPath "$BFHR_DERIVED_DATA" \
    -destination "platform=iOS Simulator,name=$device" -only-testing:"BruteForceHRUITests/$1" 2>&1 | grep -E "error:|XCTAssert|Test Case .*(passed|failed)" || true
}

lookup_uid() {
  api -X POST "https://identitytoolkit.googleapis.com/v1/projects/$project/accounts:lookup" -d "{\"email\":[\"$email\"]}" \
    | python3 -c 'import json,sys;print((json.load(sys.stdin).get("users") or [{}])[0].get("localId",""))'
}

uid=""
cleanup() {
  [[ -n "$uid" ]] || uid="$(lookup_uid)"
  [[ -n "$uid" ]] || return 0
  for collection in applications applicationEvents interviews contacts; do
    for name in $(api "$docs/users/$uid/$collection?pageSize=300" | python3 -c 'import json,sys;[print(d["name"]) for d in json.load(sys.stdin).get("documents",[])]'); do
      api -X DELETE "https://firestore.googleapis.com/v1/$name" >/dev/null
    done
  done
  api -X DELETE "$docs/users/$uid" >/dev/null
  api -X POST "https://identitytoolkit.googleapis.com/v1/projects/$project/accounts:delete" -d "{\"localId\":\"$uid\"}" >/dev/null
  echo "cleanup: user $uid and its documents deleted"
  [[ -z "$(lookup_uid)" ]] && echo "cleanup: verified, no user for $email"
}
trap cleanup EXIT

export TEST_RUNNER_BFHR_E2E_EMAIL="$email" TEST_RUNNER_BFHR_CAPTURE_DIR="$out"
# Start signed out: Firebase keeps its session in the keychain, which survives reinstalls.
udid="$(xcrun simctl list devices available | grep -F "    $device (" | head -n 1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')"
xcrun simctl boot "$udid" 2>/dev/null || true
xcrun simctl uninstall "$udid" com.savas07.bruteforcehr 2>/dev/null || true
xcrun simctl keychain "$udid" reset
# The link is created here (no email is sent); the app asks for the address when it opens it.
# Sign-up is invite-only (docs/runbooks/accounts.md): create the throwaway user with the admin API
# first, so the app signs in to an existing account and the allowlist stays untouched.
api -X POST "https://identitytoolkit.googleapis.com/v1/projects/$project/accounts" -d "{\"email\":\"$email\"}" >/dev/null
link="$(api -X POST "https://identitytoolkit.googleapis.com/v1/projects/$project/accounts:sendOobCode" -d "{\"requestType\":\"EMAIL_SIGNIN\",\"email\":\"$email\",\"continueUrl\":\"https://bruteforcehr.web.app/auth/finish\",\"canHandleCodeInApp\":true,\"iOSBundleId\":\"com.savas07.bruteforcehr\",\"returnOobLink\":true}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["oobLink"])')"
export TEST_RUNNER_BFHR_E2E_LINK="$link"
run_test TrackerEndToEndTests/testTrackerOnLiveData

uid="$(lookup_uid)"
echo "--- users/$uid (live Firestore)"
for collection in applications applicationEvents interviews; do
  echo "--- $collection"
  api "$docs/users/$uid/$collection?pageSize=100" | python3 -c '
import json,sys
def v(x):
    return list(x.values())[0] if isinstance(x, dict) and x else x
for d in sorted(json.load(sys.stdin).get("documents",[]), key=lambda d: d.get("createTime","")):
    f = d["fields"]
    keys = ["company","status","appliedAt","nextAction","notes","type","fromStatus","toStatus","actor","revertsEventId","title","round","startsAt","schemaVersion"]
    print(d["name"].rsplit("/",1)[1], {k: v(f[k]) for k in keys if k in f})'
done
