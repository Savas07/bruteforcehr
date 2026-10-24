#!/usr/bin/env bash
# Live check of Mail, Today's mail section, the timeline and Settings against project
# `bruteforcehr` with a throwaway user (docs/design/foundation-ios.md, "Live data: Mail"):
#   create the user → seed its mail with the Admin SDK (apps/functions/scripts/live-ios-mail.ts)
#   → MailEndToEndTests (review → Undo → confirm → the server's move, Undo of an automatic move,
#   timeline email, Settings) → read the documents back → delete the user and its data.
# Needs gcloud (logged in, plus application-default credentials for the Admin SDK) and a Debug
# build in BFHR_DERIVED_DATA. Run inside the iOS lock:
#   BFHR_DERIVED_DATA=… apps/ios/scripts/with-ios-lock.sh apps/ios/scripts/mail-live-check.sh [device]
set -euo pipefail

ios_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$(cd "$ios_dir/../.." && pwd)"
device="${1:-iPhone 17 Pro}"
project=bruteforcehr
email="bfhr-iosmail-e2e-$(date +%s)@example.com"
out="$repo_root/artifacts/screens/ios/mail-live"
mkdir -p "$out"
token="$(gcloud auth print-access-token)"
api() { curl -sS -H "Authorization: Bearer $token" -H "x-goog-user-project: $project" -H 'Content-Type: application/json' "$@"; }
admin() { (cd "$repo_root/apps/functions" && pnpm exec tsx scripts/live-ios-mail.ts "$@"); }

lookup_uid() {
  api -X POST "https://identitytoolkit.googleapis.com/v1/projects/$project/accounts:lookup" -d "{\"email\":[\"$email\"]}" \
    | python3 -c 'import json,sys;print((json.load(sys.stdin).get("users") or [{}])[0].get("localId",""))'
}

uid=""
cleanup() {
  [[ -n "$uid" ]] || uid="$(lookup_uid)"
  [[ -n "$uid" ]] || return 0
  # Every per-user tree (Firestore, Storage, mail serverOnly data), then the Auth user.
  admin delete "$uid" || echo "cleanup: deleteUserData reported an error"
  api -X POST "https://identitytoolkit.googleapis.com/v1/projects/$project/accounts:delete" -d "{\"localId\":\"$uid\"}" >/dev/null
  echo "cleanup: user $uid and its data deleted"
  [[ -z "$(lookup_uid)" ]] && echo "cleanup: verified, no user for $email"
}
trap cleanup EXIT

# The user exists before the app signs in, so its mail can be seeded first.
uid="$(api -X POST "https://identitytoolkit.googleapis.com/v1/projects/$project/accounts" -d "{\"email\":\"$email\",\"emailVerified\":true}" \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["localId"])')"
echo "created $uid <$email>"
admin seed "$uid" "$email"

udid="$(xcrun simctl list devices available | grep -F "    $device (" | head -n 1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')"
xcrun simctl boot "$udid" 2>/dev/null || true
xcrun simctl uninstall "$udid" com.savas07.bruteforcehr 2>/dev/null || true
xcrun simctl keychain "$udid" reset
link="$(api -X POST "https://identitytoolkit.googleapis.com/v1/projects/$project/accounts:sendOobCode" -d "{\"requestType\":\"EMAIL_SIGNIN\",\"email\":\"$email\",\"continueUrl\":\"https://bruteforcehr.web.app/auth/finish\",\"canHandleCodeInApp\":true,\"iOSBundleId\":\"com.savas07.bruteforcehr\",\"returnOobLink\":true}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["oobLink"])')"
export TEST_RUNNER_BFHR_E2E_EMAIL="$email" TEST_RUNNER_BFHR_E2E_LINK="$link" TEST_RUNNER_BFHR_CAPTURE_DIR="$out"
xcodebuild test-without-building -project "$ios_dir/BruteForceHR.xcodeproj" -scheme BruteForceHR -derivedDataPath "$BFHR_DERIVED_DATA" \
  -destination "platform=iOS Simulator,name=$device" -only-testing:BruteForceHRUITests/MailEndToEndTests/testMailOnLiveData 2>&1 \
  | grep -E "error:|XCTAssert|Test Case .*(passed|failed)" || true

echo "--- users/$uid (live Firestore, after the app and the trigger)"
admin report "$uid"
