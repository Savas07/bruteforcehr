#!/usr/bin/env bash
# Live check of the iOS Jobs tab and Apply against project `bruteforcehr` with a throwaway user
# (the pattern of tracker-live-check.sh, docs/design/foundation-ios.md "Live data"):
#   create the user (verified email) → seed a CV + revision, 5 `jobs` and their `jobMatches`
#   (and a connected `mailAccounts` doc when `mailSend` is deployed) → sign in by email link →
#   JobsEndToEndTests (feed, Work mode, Save, company site + Yes I applied, email via Mail,
#   mailSend + Undo, paste a link) → read and check the documents through the Firestore REST API
#   → delete every document, the Storage objects and the user, and verify they're gone.
# Needs gcloud (logged in) and a Debug build-for-testing in BFHR_DERIVED_DATA. Run inside the lock:
#   BFHR_DERIVED_DATA=… apps/ios/scripts/with-ios-lock.sh apps/ios/scripts/jobs-live-check.sh [device]
set -euo pipefail

ios_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$(cd "$ios_dir/../.." && pwd)"
device="${1:-iPhone 17 Pro}"
project=bruteforcehr
bucket=bruteforcehr.firebasestorage.app
email="bfhr-iosjobs-e2e-$(date +%s)@example.com"
out="$repo_root/artifacts/screens/ios/jobs-live"
log="$(mktemp -t bfhr-jobs-e2e).log"
mkdir -p "$out"
export BFHR_TOKEN="$(gcloud auth print-access-token)" BFHR_PROJECT="$project"
api() { curl -sS -H "Authorization: Bearer $BFHR_TOKEN" -H "x-goog-user-project: $project" -H 'Content-Type: application/json' "$@"; }
identity="https://identitytoolkit.googleapis.com/v1/projects/$project"

lookup_uid() {
  api -X POST "$identity/accounts:lookup" -d "{\"email\":[\"$email\"]}" \
    | python3 -c 'import json,sys;print((json.load(sys.stdin).get("users") or [{}])[0].get("localId",""))'
}

# Firestore REST helpers shared by seeding, reading and cleanup (python3, stdlib only).
firestore_py="$(mktemp -t bfhr-firestore).py"
cat >"$firestore_py" <<'PY'
import json, os, re, sys, urllib.request

PROJECT = os.environ["BFHR_PROJECT"]
ROOT = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")

def call(method, url, body=None):
    request = urllib.request.Request(url, method=method, data=None if body is None else json.dumps(body).encode())
    request.add_header("Authorization", "Bearer " + os.environ["BFHR_TOKEN"])
    request.add_header("x-goog-user-project", PROJECT)
    request.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(request) as response:
        text = response.read()
        return json.loads(text) if text else {}

def value(v):
    if v is None: return {"nullValue": None}
    if isinstance(v, bool): return {"booleanValue": v}
    if isinstance(v, int): return {"integerValue": str(v)}
    if isinstance(v, float): return {"doubleValue": v}
    if isinstance(v, str): return {"timestampValue": v} if ISO.match(v) else {"stringValue": v}
    if isinstance(v, list): return {"arrayValue": {"values": [value(x) for x in v]}}
    if isinstance(v, dict): return {"mapValue": {"fields": {k: value(x) for k, x in v.items()}}}
    raise TypeError(v)

def plain(v):
    kind, inner = next(iter(v.items()))
    if kind == "nullValue": return None
    if kind == "integerValue": return int(inner)
    if kind == "mapValue": return {k: plain(x) for k, x in inner.get("fields", {}).items()}
    if kind == "arrayValue": return [plain(x) for x in inner.get("values", [])]
    return inner

def put(path, data):
    """Writes a whole document (schemaVersion 1), path relative to the database root."""
    fields = {k: value(v) for k, v in data.items() if k != "id"}
    fields["schemaVersion"] = value(1)
    call("PATCH", f"{ROOT}/{path}", {"fields": fields})

def documents(path):
    """Documents of a collection as plain dicts with `id`."""
    result, token = [], ""
    while True:
        page = call("GET", f"{ROOT}/{path}?pageSize=300" + (f"&pageToken={token}" if token else ""))
        for d in page.get("documents", []):
            doc = {k: plain(x) for k, x in d.get("fields", {}).items()}
            doc["id"] = d["name"].rsplit("/", 1)[1]
            doc["_name"] = d["name"]
            result.append(doc)
        token = page.get("nextPageToken", "")
        if not token: return result

def collections(path):
    return call("POST", f"{ROOT}/{path}:listCollectionIds", {"pageSize": 100}).get("collectionIds", [])

def delete_tree(path):
    """Deletes a document and everything under it; returns the number of documents deleted."""
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
    left="$(fs 'print(len(fs.collections("users/"+sys.argv[1])))' "$uid")"
    objects="$({ gcloud storage ls "gs://$bucket/users/$uid/**" 2>/dev/null || true; } | wc -l | tr -d ' ')"
    echo "cleanup: user $uid → subcollections left: $left, Storage objects left: $objects, account: $([[ -z "$(lookup_uid)" ]] && echo deleted || echo STILL THERE)"
  fi
  rm -f "$firestore_py"
  exit "$status"
}
trap cleanup EXIT

# The user exists before the app signs in (email verified, as an email-link sign-in leaves it), so
# the seeded documents are there on the first snapshot.
uid="$(api -X POST "$identity/accounts" -d "{\"email\":\"$email\",\"emailVerified\":true}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["localId"])')"
echo "--- user $uid ($email)"

mail_send=""
if firebase functions:list --project "$project" 2>/dev/null | grep -q '│ mailSend '; then mail_send="e2e-halden"; fi

fs '
import json
fixture = json.load(open(sys.argv[2]))
uid, email = sys.argv[1], sys.argv[3]
base = f"users/{uid}"
cv_id, rev_id = "e2e-cv-en", "e2e-rev-1"

profile = dict(fixture["profile"], fullName="Test Kişi", email=email, defaultCvId=cv_id, hiddenCompanies=[])
fs.put(base, profile)
cv = dict(next(c for c in fixture["cvs"] if c["id"] == "cv-en"), currentRevisionId=rev_id, importedFrom=None, version=1)
fs.put(f"{base}/cvs/{cv_id}", cv)
revision = next(r for r in fixture["cvRevisions"] if r["id"] == "rev-en-3")
content = dict(revision["content"], basics=dict(revision["content"]["basics"], name="Test Kişi", email=email))
fs.put(f"{base}/cvs/{cv_id}/revisions/{rev_id}", {k: v for k, v in dict(revision, content=content, basedOnRevisionId=None).items() if k != "cvId"})

seeds = {
    "job-lighthouse-senior-frontend": "e2e-lighthouse",  # remote, company site (Workable)
    "job-mercator-frontend": "e2e-mercator",              # remote, a board (LinkedIn)
    "job-halden-product": "e2e-halden",                   # applyEmail on the posting
    "job-pixelpost-design-systems": "e2e-pixelpost",      # hybrid: saved from the feed
    "job-zuiderzee-webgl": "e2e-zuiderzee",               # onsite: email via a typed address
}
matches = {m["id"]: m for m in fixture["jobMatches"]}
for source, target in seeds.items():
    job = dict(next(j for j in fixture["jobs"] if j["id"] == source))
    # sourceKeys = @bfhr/core jobSourceKey: source:sourceId, or source:url without an id.
    job["sourceKeys"] = ["%s:%s" % (s["source"], s["sourceId"] or s["url"]) for s in job["sources"]]
    fs.put(f"{base}/jobs/{target}", job)
    match = dict(matches[source], basedOnCvId=cv_id, basedOnCvRevisionId=rev_id, state="new", dismissReasons=[], stateChangedAt=None)
    fs.put(f"{base}/jobMatches/{target}", match)
print("seeded: profile, cvs/" + cv_id + " + revision, jobs + jobMatches " + ", ".join(seeds.values()))
' "$uid" "$repo_root/packages/fixtures/conformance/populated.json" "$email"

import_url="$(curl -sS --max-time 20 https://boards-api.greenhouse.io/v1/boards/anthropic/jobs | python3 -c 'import json,sys;print(json.load(sys.stdin)["jobs"][0]["absolute_url"])')"
echo "--- paste-a-link posting: $import_url"
[[ -n "$mail_send" ]] && echo "--- mailSend deployed: send + Undo on $mail_send" || echo "--- mailSend not deployed: the send-from-account path is PENDING"

# Start signed out: Firebase keeps its session in the keychain, which survives reinstalls.
udid="$(xcrun simctl list devices available | grep -F "    $device (" | head -n 1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')"
xcrun simctl boot "$udid" 2>/dev/null || true
xcrun simctl uninstall "$udid" com.savas07.bruteforcehr 2>/dev/null || true
xcrun simctl keychain "$udid" reset
link="$(api -X POST "$identity/accounts:sendOobCode" -d "{\"requestType\":\"EMAIL_SIGNIN\",\"email\":\"$email\",\"continueUrl\":\"https://bruteforcehr.web.app/auth/finish\",\"canHandleCodeInApp\":true,\"iOSBundleId\":\"com.savas07.bruteforcehr\",\"returnOobLink\":true}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["oobLink"])')"

export TEST_RUNNER_BFHR_E2E_EMAIL="$email" TEST_RUNNER_BFHR_E2E_LINK="$link" TEST_RUNNER_BFHR_CAPTURE_DIR="$out" \
  TEST_RUNNER_BFHR_E2E_JOBS="e2e-lighthouse,e2e-mercator,e2e-halden,e2e-pixelpost,e2e-zuiderzee" \
  TEST_RUNNER_BFHR_E2E_REMOTE_JOBS="e2e-lighthouse,e2e-mercator" \
  TEST_RUNNER_BFHR_E2E_SAVE_JOB="e2e-pixelpost" TEST_RUNNER_BFHR_E2E_SITE_JOB="e2e-lighthouse" \
  TEST_RUNNER_BFHR_E2E_EMAIL_JOB="e2e-zuiderzee" TEST_RUNNER_BFHR_E2E_RECRUITER="jobs-e2e-recruiter@example.com" \
  TEST_RUNNER_BFHR_E2E_IMPORT_URL="$import_url" TEST_RUNNER_BFHR_E2E_MAIL_SEND="$mail_send"
run_test() {
  xcodebuild test-without-building -project "$ios_dir/BruteForceHR.xcodeproj" -scheme BruteForceHR -derivedDataPath "$BFHR_DERIVED_DATA" \
    -destination "platform=iOS Simulator,name=$device" -only-testing:"BruteForceHRUITests/JobsEndToEndTests/$1" >"$log" 2>&1 || true
  grep -E "error:|XCTAssert|Test Case .*(passed|failed)|Executed" "$log" || true
  grep -q "Test Case .*$1.* passed" "$log"
}
ui_passed=1
run_test testJobsOnLiveData || ui_passed=0
if [[ -n "$mail_send" ]]; then
  # Seeded only now: with a connected account Review email sends from it instead of Mail.
  fs '
import json
account = dict(json.load(open(sys.argv[2]))["mailAccounts"][0], address=sys.argv[3], displayName="Gmail", secretRef="mail/tokens/e2e-gmail", lastError=None)
fs.put(f"users/{sys.argv[1]}/mailAccounts/e2e-gmail", account)
print("seeded: mailAccounts/e2e-gmail (gmail, connected, canSend)")
' "$uid" "$repo_root/packages/fixtures/conformance/populated.json" "$email"
  run_test testSendFromAccountAndUndo || ui_passed=0
fi

echo "--- users/$uid (live Firestore)"
checks_status=0
fs '
uid, mail_send, import_url, ui_passed = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4] == "1"
base = f"users/{uid}"
data = {c: fs.documents(f"{base}/{c}") for c in ["jobs", "jobMatches", "applications", "applicationEvents", "coverLetters", "renderedFiles", "savedSearches", "mailAccounts"]}
keys = {
    "jobs": ["company", "title", "remoteType", "applyUrl", "applyEmail", "sourceKeys", "createdAt"],
    "jobMatches": ["score", "state", "basedOnCvId", "stateChangedAt"],
    "applications": ["jobId", "company", "status", "channel", "appliedAt", "cvId", "cvRevisionId", "cvFileId", "emailSend", "schemaVersion"],
    "applicationEvents": ["applicationId", "type", "fromStatus", "toStatus", "actor", "occurredAt"],
    "coverLetters": ["jobId", "title"],
    "renderedFiles": ["kind", "cvId", "cvRevisionId", "storagePath", "fileName", "sizeBytes"],
    "savedSearches": ["name", "query"],
    "mailAccounts": ["provider", "address", "status", "canSend"],
}
for collection, docs in data.items():
    print(f"--- {collection} ({len(docs)})")
    for d in sorted(docs, key=lambda d: d["id"]):
        print(" ", d["id"], {k: d[k] for k in keys[collection] if k in d})

apps = {a.get("jobId"): a for a in data["applications"]}
events = lambda app: [e for e in data["applicationEvents"] if app and e["applicationId"] == app["id"]]
match = {m["id"]: m for m in data["jobMatches"]}
saved, site, mail = apps.get("e2e-pixelpost"), apps.get("e2e-lighthouse"), apps.get("e2e-zuiderzee")
seeded = {"e2e-lighthouse", "e2e-mercator", "e2e-halden", "e2e-pixelpost", "e2e-zuiderzee"}
imported = [j for j in data["jobs"] if j["id"] not in seeded]
checks = [
    ("UI test passed", ui_passed),
    ("Save: application in Saved", bool(saved) and saved["status"] == "saved"),
    ("Save: created event (to saved)", any(e["type"] == "created" and e["toStatus"] == "saved" for e in events(saved))),
    ("Save: jobMatches state saved", match.get("e2e-pixelpost", {}).get("state") == "saved"),
    ("Site: application Applied", bool(site) and site["status"] == "applied"),
    ("Site: CV revision pinned", bool(site) and site.get("cvId") == "e2e-cv-en" and site.get("cvRevisionId") == "e2e-rev-1"),
    ("Site: status_changed event to applied", any(e["type"] == "status_changed" and e["toStatus"] == "applied" for e in events(site))),
    ("Email: application Preparing via email", bool(mail) and mail["status"] == "preparing" and mail.get("channel") == "email"),
    ("Link: a new jobs doc from the posting", any(any(import_url.rstrip("/").split("/")[-1] in k for k in j.get("sourceKeys", [])) for j in imported)),
]
if mail_send:
    sent = apps.get(mail_send)
    checks.append(("mailSend: emailSend.state cancelled", bool(sent) and (sent.get("emailSend") or {}).get("state") == "cancelled"))
print("--- checks")
for name, ok in checks:
    print(("PASS " if ok else "FAIL ") + name)
if not mail_send:
    print("PENDING mailSend + Undo (mailSend is not deployed)")
sys.exit(0 if all(ok for _, ok in checks) else 1)
' "$uid" "$mail_send" "$import_url" "$ui_passed" || checks_status=$?
echo "--- Storage"
gcloud storage ls -l "gs://$bucket/users/$uid/**" 2>/dev/null || true
echo "--- screenshots: $out"
exit "$checks_status"
