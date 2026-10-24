#!/usr/bin/env bash
# Live check of the Share Extension against project `bruteforcehr` with a throwaway user:
#   sign in by email link → Safari opens a public posting → Share → BruteForceHR → fields read by
#   jobImportUrl → Save and log as applied → read jobs / applications / applicationEvents back
#   through the Firestore REST API → delete them, the import cache and the user.
# Needs gcloud (logged in) and a Debug build-for-testing in BFHR_DERIVED_DATA. Run inside the iOS lock:
#   BFHR_DERIVED_DATA=… apps/ios/scripts/with-ios-lock.sh apps/ios/scripts/share-live-check.sh [device] [job url]
set -euo pipefail

ios_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$(cd "$ios_dir/../.." && pwd)"
device="${1:-iPhone 17 Pro}"
job_url="${2:-https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245}"
project=bruteforcehr
email="bfhr-share-e2e-$(date +%s)@example.com"
out="$repo_root/artifacts/screens/ios/share-live"
mkdir -p "$out"
token="$(gcloud auth print-access-token)"
api() { curl -sS -H "Authorization: Bearer $token" -H "x-goog-user-project: $project" -H 'Content-Type: application/json' "$@"; }
docs="https://firestore.googleapis.com/v1/projects/$project/databases/(default)/documents"

lookup_uid() {
  api -X POST "https://identitytoolkit.googleapis.com/v1/projects/$project/accounts:lookup" -d "{\"email\":[\"$email\"]}" \
    | python3 -c 'import json,sys;print((json.load(sys.stdin).get("users") or [{}])[0].get("localId",""))'
}

delete_collection() {
  for name in $(api "$docs/$1?pageSize=300" | python3 -c 'import json,sys;[print(d["name"]) for d in json.load(sys.stdin).get("documents",[])]'); do
    api -X DELETE "https://firestore.googleapis.com/v1/$name" >/dev/null
  done
}

uid=""
cleanup() {
  [[ -n "$uid" ]] || uid="$(lookup_uid)"
  [[ -n "$uid" ]] || return 0
  # jobMatches are written by the jobCreatedMatch trigger a moment after the job.
  sleep 5
  for collection in jobs jobMatches applications applicationEvents; do delete_collection "users/$uid/$collection"; done
  delete_collection "serverOnly/jobImport/users/$uid/jobImportPages"
  api -X DELETE "$docs/users/$uid" >/dev/null
  api -X POST "https://identitytoolkit.googleapis.com/v1/projects/$project/accounts:delete" -d "{\"localId\":\"$uid\"}" >/dev/null
  echo "cleanup: user $uid and its documents deleted"
  [[ -z "$(lookup_uid)" ]] && echo "cleanup: verified, no user for $email"
}
trap cleanup EXIT

udid="$(xcrun simctl list devices available | grep -F "    $device (" | head -n 1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')"
xcrun simctl boot "$udid" 2>/dev/null || true
xcrun simctl uninstall "$udid" com.savas07.bruteforcehr 2>/dev/null || true
xcrun simctl keychain "$udid" reset
# Sign-up is invite-only (docs/runbooks/accounts.md): create the throwaway user with the admin API
# first, so the app signs in to an existing account and the allowlist stays untouched.
api -X POST "https://identitytoolkit.googleapis.com/v1/projects/$project/accounts" -d "{\"email\":\"$email\"}" >/dev/null
link="$(api -X POST "https://identitytoolkit.googleapis.com/v1/projects/$project/accounts:sendOobCode" -d "{\"requestType\":\"EMAIL_SIGNIN\",\"email\":\"$email\",\"continueUrl\":\"https://bruteforcehr.web.app/auth/finish\",\"canHandleCodeInApp\":true,\"iOSBundleId\":\"com.savas07.bruteforcehr\",\"returnOobLink\":true}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["oobLink"])')"
export TEST_RUNNER_BFHR_E2E_EMAIL="$email" TEST_RUNNER_BFHR_E2E_LINK="$link" TEST_RUNNER_BFHR_E2E_JOB_URL="$job_url" TEST_RUNNER_BFHR_CAPTURE_DIR="$out"
xcodebuild test-without-building -project "$ios_dir/BruteForceHR.xcodeproj" -scheme BruteForceHR -derivedDataPath "$BFHR_DERIVED_DATA" \
  -destination "platform=iOS Simulator,id=$udid" -only-testing:"BruteForceHRUITests/ShareExtensionEndToEndTests" 2>&1 \
  | grep -E "error:|XCTAssert|Test Case .*(passed|failed)" || true

uid="$(lookup_uid)"
sleep 5
for collection in jobs jobMatches applications applicationEvents; do
  echo "--- users/$uid/$collection (live Firestore)"
  api "$docs/users/$uid/$collection?pageSize=50" | python3 -c '
import json,sys
def v(x):
    return list(x.values())[0] if isinstance(x, dict) and x else x
for d in json.load(sys.stdin).get("documents",[]):
    f = d["fields"]
    keys = ["title","company","role","status","state","jobId","source","appliedAt","actor","toStatus","fingerprint","schemaVersion"]
    print(d["name"].rsplit("/",1)[1], {k: v(f[k]) for k in keys if k in f})'
done
echo "screenshots: $out"
