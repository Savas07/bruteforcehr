#!/usr/bin/env bash
# Live check of first-run onboarding on iOS against project `bruteforcehr` with a throwaway user
# (the pattern of jobs-live-check.sh): create the user with the Admin API (sign-up is invite-only,
# docs/runbooks/accounts.md) and no profile → sign in by email link → OnboardingEndToEndTests
# (cvImport of a JSON Resume, preferences, Start searching, Today, Settings › Job preferences) →
# read `users/{uid}`, its CV and saved search back through the Firestore REST API and check them →
# delete every document, the Storage objects and the user, and verify they're gone.
# Needs gcloud (logged in) and a Debug build-for-testing in BFHR_DERIVED_DATA. Run inside the lock:
#   BFHR_DERIVED_DATA=… apps/ios/scripts/with-ios-lock.sh apps/ios/scripts/onboarding-live-check.sh [device]
set -euo pipefail

ios_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$(cd "$ios_dir/../.." && pwd)"
device="${1:-iPhone 17 Pro}"
project=bruteforcehr
bucket=bruteforcehr.firebasestorage.app
email="bfhr-iosonboarding-e2e-$(date +%s)@example.com"
out="$repo_root/artifacts/screens/ios/onboarding-live"
log="$(mktemp -t bfhr-onboarding-e2e).log"
resume="$(mktemp -t bfhr-onboarding-resume).json"
mkdir -p "$out"
export BFHR_TOKEN="$(gcloud auth print-access-token)" BFHR_PROJECT="$project"
api() { curl -sS -H "Authorization: Bearer $BFHR_TOKEN" -H "x-goog-user-project: $project" -H 'Content-Type: application/json' "$@"; }
identity="https://identitytoolkit.googleapis.com/v1/projects/$project"

cat >"$resume" <<'JSON'
{"basics":{"name":"Test Kişi","label":"Mobile Engineer","email":"bfhr-ios-e2e@example.com","summary":"Mobile engineer building banking apps in Swift.","location":{"city":"Berlin","countryCode":"DE"}},
 "work":[{"name":"Example Bank","position":"Mobile Engineer","startDate":"2021-04","highlights":["Built the card controls screen used by 2 million customers."]}],
 "skills":[{"name":"Languages","keywords":["Swift","Kotlin","SQL"]}],
 "languages":[{"language":"Turkish","fluency":"Native"},{"language":"English","fluency":"C1"}]}
JSON

lookup_uid() {
  api -X POST "$identity/accounts:lookup" -d "{\"email\":[\"$email\"]}" \
    | python3 -c 'import json,sys;print((json.load(sys.stdin).get("users") or [{}])[0].get("localId",""))'
}

# Firestore REST helpers (python3, stdlib only).
firestore_py="$(mktemp -t bfhr-firestore).py"
cat >"$firestore_py" <<'PY'
import json, os, urllib.request

PROJECT = os.environ["BFHR_PROJECT"]
ROOT = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"

def call(method, url, body=None):
    request = urllib.request.Request(url, method=method, data=None if body is None else json.dumps(body).encode())
    request.add_header("Authorization", "Bearer " + os.environ["BFHR_TOKEN"])
    request.add_header("x-goog-user-project", PROJECT)
    request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request) as response:
            text = response.read()
            return json.loads(text) if text else {}
    except urllib.error.HTTPError as error:
        if error.code == 404: return None
        raise

def plain(v):
    kind, inner = next(iter(v.items()))
    if kind == "nullValue": return None
    if kind == "integerValue": return int(inner)
    if kind == "mapValue": return {k: plain(x) for k, x in inner.get("fields", {}).items()}
    if kind == "arrayValue": return [plain(x) for x in inner.get("values", [])]
    return inner

def document(path):
    d = call("GET", f"{ROOT}/{path}")
    if d is None: return None
    doc = {k: plain(x) for k, x in d.get("fields", {}).items()}
    doc["id"] = d["name"].rsplit("/", 1)[1]
    return doc

def documents(path):
    result, token = [], ""
    while True:
        page = call("GET", f"{ROOT}/{path}?pageSize=300" + (f"&pageToken={token}" if token else "")) or {}
        for d in page.get("documents", []):
            doc = {k: plain(x) for k, x in d.get("fields", {}).items()}
            doc["id"] = d["name"].rsplit("/", 1)[1]
            result.append(doc)
        token = page.get("nextPageToken", "")
        if not token: return result

def collections(path):
    return (call("POST", f"{ROOT}/{path}:listCollectionIds", {"pageSize": 100}) or {}).get("collectionIds", [])

def delete_tree(path):
    count = 0
    for collection in collections(path):
        for doc in documents(f"{path}/{collection}"):
            count += delete_tree(f"{path}/{collection}/{doc['id']}")
    call("DELETE", f"{ROOT}/{path}")
    return count + 1
PY
fs() { BFHR_FIRESTORE="$firestore_py" python3 -c "import importlib.util,os,sys;s=importlib.util.spec_from_file_location('fs',os.environ['BFHR_FIRESTORE']);fs=importlib.util.module_from_spec(s);s.loader.exec_module(fs);$1" "${@:2}"; }

uid=""
cleanup() {
  local status=$?
  set +e
  [[ -n "$uid" ]] || uid="$(lookup_uid)"
  if [[ -n "$uid" ]]; then
    fs 'print("cleanup: deleted", fs.delete_tree("users/"+sys.argv[1]), "documents")' "$uid"
    gcloud storage rm -r "gs://$bucket/users/$uid/" --quiet >/dev/null 2>&1 || true
    api -X POST "$identity/accounts:delete" -d "{\"localId\":\"$uid\"}" >/dev/null
    left="$(fs 'print(len(fs.collections("users/"+sys.argv[1])), "subcollections,", "profile " + ("STILL THERE" if fs.document("users/"+sys.argv[1]) else "deleted"))' "$uid")"
    objects="$({ gcloud storage ls "gs://$bucket/users/$uid/**" 2>/dev/null || true; } | wc -l | tr -d ' ')"
    echo "cleanup: user $uid → $left, Storage objects left: $objects, account: $([[ -z "$(lookup_uid)" ]] && echo deleted || echo STILL THERE)"
  fi
  rm -f "$firestore_py" "$resume"
  exit "$status"
}
trap cleanup EXIT

# A new account with no `users/{uid}` (email verified, as an email-link sign-in leaves it).
uid="$(api -X POST "$identity/accounts" -d "{\"email\":\"$email\",\"emailVerified\":true}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["localId"])')"
echo "--- user $uid ($email), profile before sign-in: $(fs 'print("exists" if fs.document("users/"+sys.argv[1]) else "none")' "$uid")"

# Start signed out: Firebase keeps its session in the keychain, which survives reinstalls.
udid="$(xcrun simctl list devices available | grep -F "    $device (" | head -n 1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')"
xcrun simctl boot "$udid" 2>/dev/null || true
xcrun simctl uninstall "$udid" com.savas07.bruteforcehr 2>/dev/null || true
xcrun simctl keychain "$udid" reset
link="$(api -X POST "$identity/accounts:sendOobCode" -d "{\"requestType\":\"EMAIL_SIGNIN\",\"email\":\"$email\",\"continueUrl\":\"https://bruteforcehr.web.app/auth/finish\",\"canHandleCodeInApp\":true,\"iOSBundleId\":\"com.savas07.bruteforcehr\",\"returnOobLink\":true}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["oobLink"])')"

export TEST_RUNNER_BFHR_E2E_EMAIL="$email" TEST_RUNNER_BFHR_E2E_LINK="$link" TEST_RUNNER_BFHR_E2E_IMPORT="$resume" \
  TEST_RUNNER_BFHR_CAPTURE_DIR="$out"
ui_passed=1
xcodebuild test-without-building -project "$ios_dir/BruteForceHR.xcodeproj" -scheme BruteForceHR -derivedDataPath "$BFHR_DERIVED_DATA" \
  -destination "platform=iOS Simulator,name=$device" -only-testing:"BruteForceHRUITests/OnboardingEndToEndTests/testOnboardingOnLiveData" >"$log" 2>&1 || true
grep -E "error:|XCTAssert|Test Case .*(passed|failed)|Executed" "$log" || true
grep -q "Test Case .*testOnboardingOnLiveData.* passed" "$log" || ui_passed=0

echo "--- users/$uid (live Firestore)"
checks_status=0
fs '
import json
uid, ui_passed = sys.argv[1], sys.argv[2] == "1"
base = f"users/{uid}"
profile = fs.document(base) or {}
cvs = fs.documents(f"{base}/cvs")
searches = fs.documents(f"{base}/savedSearches")
matches = fs.documents(f"{base}/jobMatches")
keys = ["fullName", "email", "targetRoles", "seniority", "locations", "remotePreferences", "salaryFloor", "workAuthorization",
        "languages", "skills", "defaultCvId", "timezone", "uiLanguage", "aiEnabled", "onboardingCompletedAt", "createdAt", "updatedAt"]
print("profile", json.dumps({k: profile.get(k) for k in keys}, ensure_ascii=False, indent=1))
for cv in cvs: print("cvs/" + cv["id"], {k: cv.get(k) for k in ["title", "isDefault", "importedFrom", "version"]})
for s in searches: print("savedSearches/" + s["id"], json.dumps({k: s.get(k) for k in ["name", "query", "filters", "schedule", "alertThreshold", "enabled", "nextRunAt", "lastRunAt"]}, ensure_ascii=False))
print("jobMatches:", len(matches))
search = searches[0] if len(searches) == 1 else {}
roles = profile.get("targetRoles") or []
checks = [
    ("UI test passed", ui_passed),
    ("profile created by onboarding (email, timezone, settings)", profile.get("email") == sys.argv[3] and bool(profile.get("timezone")) and isinstance(profile.get("settings"), dict)),
    ("fullName from the CV", profile.get("fullName") == "Test Kişi"),
    ("targetRoles: from the CV + iOS Engineer", "iOS Engineer" in roles and len(roles) >= 2),
    ("locations: Netherlands", any(l.get("countryCode") == "NL" for l in profile.get("locations") or [])),
    ("remotePreferences: remote", "remote" in (profile.get("remotePreferences") or [])),
    ("salaryFloor: 65000 EUR a year", profile.get("salaryFloor") in ({"amount": 65000, "currency": "EUR", "period": "year"}, {"amount": "65000", "currency": "EUR", "period": "year"}) or (profile.get("salaryFloor") or {}).get("amount") in (65000, 65000.0)),
    ("workAuthorization: EU work_permit", {"region": "EU", "status": "work_permit"} in (profile.get("workAuthorization") or [])),
    ("languages from the CV (tr native, en C1)", {"language": "tr", "level": "native"} in (profile.get("languages") or []) and {"language": "en", "level": "C1"} in (profile.get("languages") or [])),
    ("skills from the CV", "swift" in (profile.get("skills") or [])),
    ("defaultCvId = the imported CV", bool(profile.get("defaultCvId")) and any(cv["id"] == profile.get("defaultCvId") for cv in cvs)),
    ("seniority from Settings: principal", profile.get("seniority") == "principal"),
    ("onboardingCompletedAt set", bool(profile.get("onboardingCompletedAt"))),
    ("one saved search", len(searches) == 1),
    ("saved search: query = first role, daily, threshold 65", search.get("query") == (roles[0] if roles else None) and search.get("schedule") == "daily" and search.get("alertThreshold") == 65 and search.get("enabled") is True),
    ("saved search: NL + remote filters", "NL" in ((search.get("filters") or {}).get("countryCodes") or []) and "remote" in ((search.get("filters") or {}).get("remoteTypes") or [])),
    ("saved search: nextRunAt set", bool(search.get("nextRunAt") or search.get("lastRunAt"))),
]
print("--- checks")
for name, ok in checks: print(("PASS " if ok else "FAIL ") + name)
sys.exit(0 if all(ok for _, ok in checks) else 1)
' "$uid" "$ui_passed" "$email" || checks_status=$?
echo "--- Storage"
gcloud storage ls -l "gs://$bucket/users/$uid/**" 2>/dev/null || true
echo "--- screenshots: $out"
exit "$checks_status"
