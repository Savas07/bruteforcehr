#!/usr/bin/env bash
# Performance budgets on the iOS Simulator (docs/BRIEF.md §9, docs/runbooks/performance.md): runs
# BruteForceHRUITests/PerformanceTests (launch to interactive; scrolling with 5,000 jobs and 1,000
# applications), then apps/ios/scripts/perf-report.ts reads the measurements from the result
# bundle, writes artifacts/perf/ios.json and fails when a budget is missed.
#
#   apps/ios/scripts/perf.sh [--device "iPhone 17 Pro" | --device <udid>] [--budget-scale 1]
#                            [--only launch|scroll] [--skip-build] [-- <xcodebuild settings>]
#
# Builds into BFHR_DERIVED_DATA (else apps/ios/build/DerivedData). On a machine shared with other
# worktrees, run it under apps/ios/scripts/with-ios-lock.sh. CI adds `-- CODE_SIGNING_ALLOWED=NO`
# (no signing identity on the runner; the simulator runs unsigned builds).
set -euo pipefail

ios_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$(cd "$ios_dir/../.." && pwd)"
derived_data="${BFHR_DERIVED_DATA:-$ios_dir/build/DerivedData}"
device="iPhone 17 Pro"
budget_scale=1
only=""
build=true
settings=()
while (($# > 0)); do
  case "$1" in
    --device) device="$2"; shift ;;
    --budget-scale) budget_scale="$2"; shift ;;
    --only) only="$2"; shift ;;
    --skip-build) build=false ;;
    --) shift; settings=("$@"); break ;;
    -h | --help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "perf.sh: unknown argument $1" >&2; exit 64 ;;
  esac
  shift
done

# A UDID, or the first available simulator with that name (else the first iPhone, with a note).
udid="$(xcrun simctl list devices available -j | node -e '
  const wanted = process.argv[1];
  const { devices } = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  const all = Object.values(devices).flat();
  let match = all.find((d) => d.udid === wanted) ?? all.find((d) => d.name === wanted);
  if (!match) {
    match = all.find((d) => d.name.startsWith("iPhone"));
    if (match) console.error(`perf.sh: no "${wanted}" simulator, using ${match.name}`);
  }
  if (!match) { console.error("perf.sh: no iPhone simulator available"); process.exit(1); }
  console.log(match.udid);
' "$device")"

case "$only" in
  "") tests=(-only-testing:BruteForceHRUITests/PerformanceTests) ;;
  launch)
    tests=(-only-testing:BruteForceHRUITests/PerformanceTests/testLaunchToInteractive
      -only-testing:BruteForceHRUITests/PerformanceTests/testLaunchBaselineSignedOut
      -only-testing:BruteForceHRUITests/PerformanceTests/testLaunchBaselineSystemApp) ;;
  scroll)
    tests=(-only-testing:BruteForceHRUITests/PerformanceTests/testScrollJobsFeed
      -only-testing:BruteForceHRUITests/PerformanceTests/testScrollTrackerBoard) ;;
  *) echo "perf.sh: --only launch or scroll" >&2; exit 64 ;;
esac

out_dir="$repo_root/artifacts/perf"
result="$out_dir/ios.xcresult"
mkdir -p "$out_dir"
rm -rf "$result"
# The Debug configuration: design mode (fixture data behind launch arguments) exists only there.
# Building it optimized like Release changed nothing measurable on CI (median launch 6.4 s
# optimized in run 40121422587 vs 4.9 s Debug in 40114592698, both inside the runner's spread), so
# perf.sh builds plain Debug and shares DerivedData with the other iOS builds.
xcodebuild_args=(-project "$ios_dir/BruteForceHR.xcodeproj" -scheme BruteForceHR -configuration Debug
  -destination "platform=iOS Simulator,id=$udid" -derivedDataPath "$derived_data" -quiet
  ${settings[@]+"${settings[@]}"})
if $build; then xcodebuild build-for-testing "${xcodebuild_args[@]}"; fi
# Performance tests report their measurements; the budgets are checked below, not by XCTest.
# One retry per failed test: on CI VMs a launch now and then stalls (17 s outliers), which fails a
# baseline test and leaves the launch budget uncalibrated (2026-10-25, run 40165729109).
status=0
xcodebuild test-without-building "${xcodebuild_args[@]}" -resultBundlePath "$result" \
  -retry-tests-on-failure -test-iterations 2 "${tests[@]}" || status=$?

xcrun xcresulttool get test-results metrics --path "$result" --compact >"$out_dir/ios-metrics.json"
node "$ios_dir/scripts/perf-report.ts" "$out_dir/ios-metrics.json" "$out_dir/ios.json" "$budget_scale"
exit "$status"
