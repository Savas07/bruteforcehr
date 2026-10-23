#!/usr/bin/env bash
# Live check of the iOS CV Studio against project `bruteforcehr` with a throwaway user
# (docs/design/foundation-ios.md, "Live data, rendering and the cv-render bundle"):
#   sign in by email link → start a CV, summary + cvAssist, template, preview + PDF share,
#   history + restore → import a JSON Resume (Storage + cvImport) → read the documents back
#   through the Firestore REST API → delete the documents, Storage objects and the user.
# Needs gcloud (logged in) and a Debug build in BFHR_DERIVED_DATA. Runs inside the iOS lock.
#
# Usage: BFHR_DERIVED_DATA=… apps/ios/scripts/cv-live-check.sh [device name]
set -euo pipefail

ios_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$(cd "$ios_dir/../.." && pwd)"
device="${1:-iPhone 17 Pro}"
project=bruteforcehr
bucket=bruteforcehr.firebasestorage.app
email="bfhr-ioscv-e2e-$(date +%s)@example.com"
out="$repo_root/artifacts/screens/ios/cv-studio/live"
resume="$(mktemp -t bfhr-e2e-resume).json"
mkdir -p "$out"
token="$(gcloud auth print-access-token)"
api() { curl -sS -H "Authorization: Bearer $token" -H "x-goog-user-project: $project" -H 'Content-Type: application/json' "$@"; }

cat >"$resume" <<'JSON'
{"basics":{"name":"Test Kişi","label":"Backend Engineer","email":"bfhr-ios-e2e@example.com","summary":"Backend engineer building payment systems in Go."},
 "work":[{"name":"Example Pay","position":"Backend Engineer","startDate":"2021-04","highlights":["Built the ledger service handling card settlements."]}],
 "education":[{"institution":"Example University","area":"Computer Engineering","endDate":"2020"}],
 "skills":[{"name":"Languages","keywords":["Go","SQL"]}]}
JSON

run_test() {
  xcodebuild test -project "$ios_dir/BruteForceHR.xcodeproj" -scheme BruteForceHR -derivedDataPath "$BFHR_DERIVED_DATA" \
    -destination "platform=iOS Simulator,name=$device" -only-testing:"BruteForceHRUITests/$1" 2>&1 | grep -E "error:|Test Case .*(passed|failed)"
}

uid=""
cleanup() {
  [[ -n "$uid" ]] || uid="$(api -X POST "https://identitytoolkit.googleapis.com/v1/projects/$project/accounts:lookup" -d "{\"email\":[\"$email\"]}" | python3 -c 'import json,sys;print((json.load(sys.stdin).get("users") or [{}])[0].get("localId",""))')"
  [[ -n "$uid" ]] || return 0
  echo "cleanup: user $uid"
  base="https://firestore.googleapis.com/v1/projects/$project/databases/(default)/documents/users/$uid"
  for cv in $(api "$base/cvs?pageSize=100" | python3 -c 'import json,sys;[print(d["name"].rsplit("/",1)[1]) for d in json.load(sys.stdin).get("documents",[])]'); do
    for rev in $(api "$base/cvs/$cv/revisions?pageSize=300" | python3 -c 'import json,sys;[print(d["name"]) for d in json.load(sys.stdin).get("documents",[])]'); do
      api -X DELETE "https://firestore.googleapis.com/v1/$rev" >/dev/null
    done
    api -X DELETE "$base/cvs/$cv" >/dev/null
  done
  api -X DELETE "$base" >/dev/null
  gcloud storage rm -r "gs://$bucket/users/$uid/" --quiet 2>/dev/null || true
  api -X POST "https://identitytoolkit.googleapis.com/v1/projects/$project/accounts:delete" -d "{\"localId\":\"$uid\"}" >/dev/null
  echo "cleanup: user, documents and Storage objects deleted"
}
trap cleanup EXIT

export TEST_RUNNER_BFHR_E2E_EMAIL="$email" TEST_RUNNER_BFHR_CAPTURE_DIR="$out"
run_test SignInEndToEndTests/testSendsLink
link="$(api -X POST "https://identitytoolkit.googleapis.com/v1/projects/$project/accounts:sendOobCode" -d "{\"requestType\":\"EMAIL_SIGNIN\",\"email\":\"$email\",\"continueUrl\":\"https://bruteforcehr.web.app/auth/finish\",\"canHandleCodeInApp\":true,\"iOSBundleId\":\"com.savas07.bruteforcehr\",\"returnOobLink\":true}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["oobLink"])')"
export TEST_RUNNER_BFHR_E2E_LINK="$link"
run_test CVStudioEndToEndTests/testSignsInAndEditsCV
export TEST_RUNNER_BFHR_E2E_IMPORT="$resume"
run_test CVStudioEndToEndTests/testImportsJSONResume

uid="$(api -X POST "https://identitytoolkit.googleapis.com/v1/projects/$project/accounts:lookup" -d "{\"email\":[\"$email\"]}" | python3 -c 'import json,sys;u=json.load(sys.stdin)["users"][0];print(u["localId"]);print("emailVerified",u.get("emailVerified"),file=sys.stderr)')"
base="https://firestore.googleapis.com/v1/projects/$project/databases/(default)/documents/users/$uid"
echo "--- users/$uid/cvs (live Firestore)"
api "$base/cvs?pageSize=100" | python3 -c '
import json,sys
for d in json.load(sys.stdin).get("documents",[]):
    f=d["fields"]; g=lambda k: list(f[k].values())[0] if k in f else None
    print(d["name"].rsplit("/",1)[1], "| title:", g("title"), "| version:", g("version"), "| template:", g("templateId"), "| imported:", "importedFrom" in f and "nullValue" not in f["importedFrom"])'
for cv in $(api "$base/cvs?pageSize=100" | python3 -c 'import json,sys;[print(d["name"].rsplit("/",1)[1]) for d in json.load(sys.stdin).get("documents",[])]'); do
  echo "--- revisions of $cv"
  api "$base/cvs/$cv/revisions?pageSize=100" | python3 -c '
import json,sys
for d in sorted(json.load(sys.stdin).get("documents",[]), key=lambda d: d["fields"]["createdAt"]["timestampValue"]):
    f=d["fields"]; print(f["createdAt"]["timestampValue"], f["source"]["stringValue"], "|", f.get("diffSummary",{}).get("stringValue"))'
done
echo "--- Storage"
gcloud storage ls "gs://$bucket/users/$uid/**" 2>/dev/null || true
