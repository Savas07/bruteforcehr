#!/usr/bin/env bash
# Captures BruteForceHR on the simulator for design critique.
#
# Builds the app and its UI tests once (Debug, iOS Simulator), then on each device, appearance
# and text size runs ScreenCaptureTests, which launches the app and saves PNGs under
# artifacts/screens/ios/<device>/ (repository root of this worktree; gitignored):
#
#   design screens (--screen):  <screen>-<state>-<theme>[-ax].png
#   update gate (--screen update-gate):  update-gate-<available|required>-<theme>[-ax].png
#   sign-in (--screen sign-in):  sign-in-<state>-<theme>[-ax].png
#   title-only shell (default): <tab>-<theme>[-ax].png
#
# Usage: apps/ios/scripts/capture.sh [--screen NAME|all]... [--state NAME]... [--size default|ax]...
#                                     [--ax] [--device NAME]... [--theme light|dark]... [--skip-build]
#   --screen    core screen in design mode: today, job-detail, cv-editor, tracker-board, mail-review, insights,
#               or all (repeatable). Without it the tabs of the title-only shell are captured.
#               update-gate (on its own): the update banner and blocking screen over Today.
#               sign-in (on its own): the signed-out screens (`-BFHRSignIn`).
#   --state     populated, empty, loading, error, offline (repeatable; default: all five);
#               for update-gate: available, required (default: both);
#               for sign-in: email, invalid, offline, check, resent, finishing, confirm, expired,
#               unusable, retry (default: all)
#   --size      default (Large) or ax (largest accessibility size, files end in -ax)
#               (repeatable; default: default)
#   --ax        same as --size ax
#   --device    simulator name (repeatable; default: "iPhone 17e" and "iPhone 17 Pro Max")
#   --theme     appearance (repeatable; default: light and dark)
#   --skip-build  reuse the last build in this worktree's DerivedData
#
# DerivedData lives in this worktree (apps/ios/build/DerivedData), so worktrees build in
# parallel. Set BFHR_DERIVED_DATA to share one DerivedData across worktrees instead (one compiled
# Firebase SDK on disk); the build then runs inside the lock so builds never overlap. The
# simulators are shared, so the capture part takes a machine-wide lock
# (/tmp/bfhr-ios-capture.lock) and waits for other worktrees' captures to finish. Simulator
# settings (appearance, text size, status bar) are restored afterwards, and devices the script
# booted are shut down again.
set -euo pipefail

ios_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$(cd "$ios_dir/../.." && pwd)"
derived_data="${BFHR_DERIVED_DATA:-$ios_dir/build/DerivedData}"
lock_dir="/tmp/bfhr-ios-capture.lock"
all_screens=(today job-detail cv-editor tracker-board mail-review insights)
all_states=(populated empty loading error offline)

screens=()
states=()
sizes=()
devices=()
themes=()
build=true
while (($# > 0)); do
  case "$1" in
    --screen) if [[ "$2" == all ]]; then screens+=("${all_screens[@]}"); else screens+=("$2"); fi; shift ;;
    --state) states+=("$2"); shift ;;
    --size) sizes+=("$2"); shift ;;
    --ax) sizes+=(ax) ;;
    --device) devices+=("$2"); shift ;;
    --theme) themes+=("$2"); shift ;;
    --skip-build) build=false ;;
    -h | --help) sed -n '2,33p' "$0"; exit 0 ;;
    *) echo "capture.sh: unknown argument $1" >&2; exit 64 ;;
  esac
  shift
done
((${#devices[@]} > 0)) || devices=("iPhone 17e" "iPhone 17 Pro Max")
((${#themes[@]} > 0)) || themes=(light dark)
((${#sizes[@]} > 0)) || sizes=(default)
contains() { local needle="$1"; shift; for item in "$@"; do [[ "$item" == "$needle" ]] && return 0; done; return 1; }
update_states=(available required)
sign_in_states=(email invalid offline check resent finishing confirm expired unusable retry)
update_gate=false
sign_in=false
if contains update-gate ${screens[@]+"${screens[@]}"}; then
  ((${#screens[@]} == 1)) || { echo "capture.sh: capture update-gate on its own" >&2; exit 64; }
  update_gate=true
  ((${#states[@]} > 0)) || states=("${update_states[@]}")
fi
if contains sign-in ${screens[@]+"${screens[@]}"}; then
  ((${#screens[@]} == 1)) || { echo "capture.sh: capture sign-in on its own" >&2; exit 64; }
  sign_in=true
  ((${#states[@]} > 0)) || states=("${sign_in_states[@]}")
fi
((${#states[@]} > 0)) || states=("${all_states[@]}")

for theme in "${themes[@]}"; do
  contains "$theme" light dark || { echo "capture.sh: theme must be light or dark" >&2; exit 64; }
done
for size in "${sizes[@]}"; do
  contains "$size" default ax || { echo "capture.sh: size must be default or ax" >&2; exit 64; }
done
for screen in ${screens[@]+"${screens[@]}"}; do
  contains "$screen" "${all_screens[@]}" update-gate sign-in || { echo "capture.sh: unknown screen $screen (${all_screens[*]} update-gate sign-in)" >&2; exit 64; }
done
if $update_gate; then valid_states=("${update_states[@]}"); elif $sign_in; then valid_states=("${sign_in_states[@]}"); else valid_states=("${all_states[@]}"); fi
for state in "${states[@]}"; do
  contains "$state" "${valid_states[@]}" || { echo "capture.sh: unknown state $state (${valid_states[*]})" >&2; exit 64; }
done

udid_for() {
  xcrun simctl list devices available | grep -F "    $1 (" | head -n 1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/'
}

udids=()
for device in "${devices[@]}"; do
  udid="$(udid_for "$device")"
  [[ -n "$udid" ]] || { echo "capture.sh: no available simulator named \"$device\"" >&2; exit 1; }
  udids+=("$udid")
done

xcodebuild_args=(-project "$ios_dir/BruteForceHR.xcodeproj" -scheme BruteForceHR -derivedDataPath "$derived_data" -quiet)

build_now() {
  echo "Building BruteForceHR and its UI tests for the iOS Simulator (DerivedData: $derived_data)…"
  xcodebuild build-for-testing "${xcodebuild_args[@]}" -destination "platform=iOS Simulator,id=${udids[0]}"
}

# Private DerivedData: build before queueing for the simulators.
if $build && [[ -z "${BFHR_DERIVED_DATA:-}" ]]; then build_now; fi

# One capture at a time on this machine: the simulators and their settings are shared.
until mkdir "$lock_dir" 2>/dev/null; do
  holder="$(cat "$lock_dir/pid" 2>/dev/null || true)"
  if [[ -n "$holder" ]] && ! kill -0 "$holder" 2>/dev/null; then
    echo "capture.sh: removing stale lock of process $holder"
    rm -rf "$lock_dir"
    continue
  fi
  echo "capture.sh: waiting for another capture (process ${holder:-?}, $(cat "$lock_dir/worktree" 2>/dev/null || echo unknown))…"
  sleep 10
done
echo $$ >"$lock_dir/pid"
echo "$repo_root" >"$lock_dir/worktree"

current_restore=""
cleanup() {
  [[ -n "$current_restore" ]] && eval "$current_restore"
  rm -rf "$lock_dir"
}
trap cleanup EXIT

# Shared DerivedData: build while holding the lock, so two worktrees never build into it at once.
if $build && [[ -n "${BFHR_DERIVED_DATA:-}" ]]; then build_now; fi

if ((${#screens[@]} > 0)); then
  test_name=testCaptureDesignScreens
  screen_list="$(IFS=,; echo "${screens[*]}")"
  state_list="$(IFS=,; echo "${states[*]}")"
else
  test_name=testCaptureEveryTab
  screen_list=""
  state_list=""
fi

for index in "${!devices[@]}"; do
  device="${devices[$index]}"
  udid="${udids[$index]}"
  out_dir="$repo_root/artifacts/screens/ios/$(echo "$device" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')"
  mkdir -p "$out_dir"

  was_booted=false
  xcrun simctl list devices | grep -F "($udid) (Booted)" >/dev/null && was_booted=true
  $was_booted || xcrun simctl boot "$udid"
  xcrun simctl bootstatus "$udid" -b >/dev/null

  original_appearance="$(xcrun simctl ui "$udid" appearance)"
  original_size="$(xcrun simctl ui "$udid" content_size)"
  current_restore="xcrun simctl ui $udid appearance $original_appearance || true; \
xcrun simctl ui $udid content_size $original_size || true; \
xcrun simctl status_bar $udid clear || true; \
$was_booted || xcrun simctl shutdown $udid || true"

  xcrun simctl status_bar "$udid" override --time 9:41 --dataNetwork wifi --wifiMode active --wifiBars 3 \
    --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100

  for size in "${sizes[@]}"; do
    if [[ "$size" == ax ]]; then content_size=accessibility-extra-extra-extra-large; suffix="-ax"; else content_size=large; suffix=""; fi
    xcrun simctl ui "$udid" content_size "$content_size"
    for theme in "${themes[@]}"; do
      echo "Capturing ${device} · ${theme}${suffix}${screen_list:+ · $screen_list}…"
      xcrun simctl ui "$udid" appearance "$theme"
      TEST_RUNNER_BFHR_CAPTURE_DIR="$out_dir" TEST_RUNNER_BFHR_CAPTURE_SUFFIX="$theme$suffix" \
        TEST_RUNNER_BFHR_CAPTURE_SCREENS="$screen_list" TEST_RUNNER_BFHR_CAPTURE_STATES="$state_list" \
        xcodebuild test-without-building "${xcodebuild_args[@]}" -destination "platform=iOS Simulator,id=$udid" \
        -only-testing:"BruteForceHRUITests/ScreenCaptureTests/$test_name"
      if [[ -n "$screen_list" ]]; then
        for screen in "${screens[@]}"; do
          for state in "${states[@]}"; do echo "$out_dir/$screen-$state-$theme$suffix.png"; done
        done
      else
        for tab in today jobs tracker cvs mail; do echo "$out_dir/$tab-$theme$suffix.png"; done
      fi
    done
  done

  eval "$current_restore"
  current_restore=""
done
