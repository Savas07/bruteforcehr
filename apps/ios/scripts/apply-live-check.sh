#!/usr/bin/env bash
# Live check of Apply's AI parts on iOS against project `bruteforcehr` with a throwaway user (the
# pattern of jobs-live-check.sh, docs/design/foundation-ios.md "Live data"):
#   create the user (verified email) via the Admin (Identity Toolkit) API → seed the profile, a CV +
#   revision, one job + match and the answers library → sign in by email link →
#   ApplyEndToEndTests (Tailor for this job with the real `cvTailor` → accept 2 → Save as new
#   version; Draft with AI through `coverLetterDraft`; the kit: Copy, Yes I applied) → read and
#   check the documents through the Firestore REST API (the `ai_tailor` revision, its pin, the
#   letter) → delete every document, the Storage objects and the user, and verify they're gone.
# Needs gcloud (logged in) and a Debug build-for-testing in BFHR_DERIVED_DATA. Run inside the lock:
#   BFHR_DERIVED_DATA=… apps/ios/scripts/with-ios-lock.sh apps/ios/scripts/apply-live-check.sh [device]
set -euo pipefail

ios_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$(cd "$ios_dir/../.." && pwd)"
device="${1:-iPhone 17 Pro}"
project=bruteforcehr
bucket=bruteforcehr.firebasestorage.app
email="bfhr-iosapply-e2e-$(date +%s)@example.com"
out="$repo_root/artifacts/screens/ios/apply-live"
log="$(mktemp -t bfhr-apply-e2e).log"
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

fs '
import json
fixture = json.load(open(sys.argv[2]))
uid, email = sys.argv[1], sys.argv[3]
base = f"users/{uid}"
cv_id, rev_id = "e2e-cv-en", "e2e-rev-1"

profile = dict(fixture["profile"], fullName="Test Kişi", email=email, defaultCvId=cv_id, hiddenCompanies=[], aiEnabled=True)
fs.put(base, profile)
cv = dict(next(c for c in fixture["cvs"] if c["id"] == "cv-en"), currentRevisionId=rev_id, importedFrom=None, version=1)
fs.put(f"{base}/cvs/{cv_id}", cv)
revision = next(r for r in fixture["cvRevisions"] if r["id"] == "rev-en-3")
content = dict(revision["content"], basics=dict(revision["content"]["basics"], name="Test Kişi", email=email))
fs.put(f"{base}/cvs/{cv_id}/revisions/{rev_id}", {k: v for k, v in dict(revision, content=content, basedOnRevisionId=None).items() if k != "cvId"})

job = dict(next(j for j in fixture["jobs"] if j["id"] == "job-lighthouse-senior-frontend"))
job["sourceKeys"] = ["%s:%s" % (s["source"], s["sourceId"] or s["url"]) for s in job["sources"]]
fs.put(f"{base}/jobs/e2e-lighthouse", job)
match = dict(next(m for m in fixture["jobMatches"] if m["id"] == "job-lighthouse-senior-frontend"),
             basedOnCvId=cv_id, basedOnCvRevisionId=rev_id, state="new", dismissReasons=[], stateChangedAt=None)
fs.put(f"{base}/jobMatches/e2e-lighthouse", match)
for answer in fixture["answers"]:
    fs.put("%s/answers/%s" % (base, answer["id"]), answer)
print("seeded: profile, cvs/" + cv_id + " + revision, jobs/e2e-lighthouse + match, answers", len(fixture["answers"]))
' "$uid" "$repo_root/packages/fixtures/conformance/populated.json" "$email"

# Start signed out: Firebase keeps its session in the keychain, which survives reinstalls.
udid="$(xcrun simctl list devices available | grep -F "    $device (" | head -n 1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')"
xcrun simctl boot "$udid" 2>/dev/null || true
xcrun simctl uninstall "$udid" com.savas07.bruteforcehr 2>/dev/null || true
xcrun simctl keychain "$udid" reset
link="$(api -X POST "$identity/accounts:sendOobCode" -d "{\"requestType\":\"EMAIL_SIGNIN\",\"email\":\"$email\",\"continueUrl\":\"https://bruteforcehr.web.app/auth/finish\",\"canHandleCodeInApp\":true,\"iOSBundleId\":\"com.savas07.bruteforcehr\",\"returnOobLink\":true}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["oobLink"])')"

export TEST_RUNNER_BFHR_E2E_EMAIL="$email" TEST_RUNNER_BFHR_E2E_LINK="$link" TEST_RUNNER_BFHR_CAPTURE_DIR="$out" \
  TEST_RUNNER_BFHR_E2E_APPLY_JOB="e2e-lighthouse"
ui_passed=1
xcodebuild test-without-building -project "$ios_dir/BruteForceHR.xcodeproj" -scheme BruteForceHR -derivedDataPath "$BFHR_DERIVED_DATA" \
  -destination "platform=iOS Simulator,name=$device" -only-testing:"BruteForceHRUITests/ApplyEndToEndTests/testTailorLetterAndKit" >"$log" 2>&1 || true
grep -E "error:|XCTAssert|Test Case .*(passed|failed)|Executed" "$log" || true
grep -q "Test Case .*testTailorLetterAndKit.* passed" "$log" || ui_passed=0

echo "--- users/$uid (live Firestore)"
checks_status=0
fs '
uid, ui_passed = sys.argv[1], sys.argv[2] == "1"
base = f"users/{uid}"
data = {c: fs.documents(f"{base}/{c}") for c in ["applications", "applicationEvents", "coverLetters", "renderedFiles", "answers"]}
revisions = fs.documents(f"{base}/cvs/e2e-cv-en/revisions")
cv = next(iter(fs.documents(f"{base}/cvs")), {})
keys = {
    "applications": ["jobId", "status", "channel", "appliedAt", "cvId", "cvRevisionId", "cvFileId", "coverLetterId", "coverLetterFileId"],
    "applicationEvents": ["applicationId", "type", "fromStatus", "toStatus", "actor"],
    "coverLetters": ["jobId", "applicationId", "title", "author", "language", "isTemplate"],
    "renderedFiles": ["kind", "cvId", "cvRevisionId", "coverLetterId", "storagePath", "fileName", "sizeBytes"],
    "answers": ["kind", "label"],
}
for collection, docs in data.items():
    print(f"--- {collection} ({len(docs)})")
    for d in sorted(docs, key=lambda d: d["id"]):
        print(" ", d["id"], {k: d[k] for k in keys[collection] if k in d})
print(f"--- cvs/e2e-cv-en/revisions ({len(revisions)})")
for r in revisions:
    print(" ", r["id"], {k: r.get(k) for k in ["source", "jobId", "basedOnRevisionId", "diffSummary"]})
tailored = [r for r in revisions if r.get("source") == "ai_tailor"]
app = next((a for a in data["applications"] if a.get("jobId") == "e2e-lighthouse"), None)
letter = next((l for l in data["coverLetters"] if l.get("jobId") == "e2e-lighthouse" and not l.get("isTemplate")), None)
seeded = next((r for r in revisions if r["id"] == "e2e-rev-1"), {})
changed = bool(tailored) and tailored[0].get("content") != seeded.get("content")
checks = [
    ("UI test passed", ui_passed),
    ("Tailor: one ai_tailor revision", len(tailored) == 1),
    ("Tailor: jobId and basedOnRevisionId", bool(tailored) and tailored[0].get("jobId") == "e2e-lighthouse" and tailored[0].get("basedOnRevisionId") == "e2e-rev-1"),
    ("Tailor: 2 suggestions applied", bool(tailored) and ": 2 of " in (tailored[0].get("diffSummary") or "")),
    ("Tailor: content differs from the base", changed),
    ("Tailor: the CV keeps its current version", cv.get("currentRevisionId") == "e2e-rev-1"),
    ("Pin: application pins the tailored revision", bool(app) and bool(tailored) and app.get("cvRevisionId") == tailored[0]["id"] and app.get("cvId") == "e2e-cv-en"),
    ("Applied: status applied, channel external_link", bool(app) and app.get("status") == "applied" and app.get("channel") == "external_link"),
    ("Applied: the tailored CV PDF stored and pinned", bool(app) and any(f["id"] == app.get("cvFileId") and f.get("cvRevisionId") == app.get("cvRevisionId") for f in data["renderedFiles"])),
    ("Letter: drafted by AI and pinned (or a gap kept it out)", letter is None or (letter.get("author") == "ai" and app.get("coverLetterId") == letter["id"])),
    ("Answers: the seeded library is intact", len(data["answers"]) == 6),
]
print("--- checks")
for name, ok in checks:
    print(("PASS " if ok else "FAIL ") + name)
if letter is None:
    print("NOTE the AI letter left a gap only the user can fill, so this run applied without a letter")
sys.exit(0 if all(ok for _, ok in checks) else 1)
' "$uid" "$ui_passed" || checks_status=$?
echo "--- Storage"
gcloud storage ls -l "gs://$bucket/users/$uid/**" 2>/dev/null || true
echo "--- screenshots: $out"
exit "$checks_status"
