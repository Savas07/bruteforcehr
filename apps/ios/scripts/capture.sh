#!/usr/bin/env bash
# Captures every tab of BruteForceHR on the simulator for design critique.
#
# Builds the app and its UI tests once for the iOS Simulator, then on each device and appearance
# runs ScreenCaptureTests, which installs and launches the app, opens bruteforcehr://<tab> and
# saves artifacts/screens/ios/<device>/<tab>-<theme>[-ax].png (repository root; gitignored).
#
# Usage: apps/ios/scripts/capture.sh [--ax] [--device NAME]... [--theme light|dark]...
#   --ax        capture at the largest accessibility Dynamic Type size (files end in -ax)
#   --device    simulator name (repeatable; default: "iPhone 17e" and "iPhone 17 Pro Max")
#   --theme     appearance (repeatable; default: light and dark)
#
# Simulator settings (appearance, text size, status bar) are restored afterwards, and devices the
# script booted are shut down again.
set -euo pipefail

ios_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$(cd "$ios_dir/../.." && pwd)"
derived_data="$ios_dir/build/DerivedData"

devices=()
themes=()
ax=false
while (($# > 0)); do
  case "$1" in
    --ax) ax=true ;;
    --device) devices+=("$2"); shift ;;
    --theme) themes+=("$2"); shift ;;
    -h | --help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "capture.sh: unknown argument $1" >&2; exit 64 ;;
  esac
  shift
done
((${#devices[@]} > 0)) || devices=("iPhone 17e" "iPhone 17 Pro Max")
((${#themes[@]} > 0)) || themes=(light dark)
for theme in "${themes[@]}"; do
  [[ "$theme" == light || "$theme" == dark ]] || { echo "capture.sh: theme must be light or dark" >&2; exit 64; }
done
if $ax; then content_size=accessibility-extra-extra-extra-large; suffix="-ax"; else content_size=large; suffix=""; fi

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

echo "Building BruteForceHR and its UI tests for the iOS Simulator…"
xcodebuild build-for-testing "${xcodebuild_args[@]}" -destination "platform=iOS Simulator,id=${udids[0]}"

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
  restore() {
    xcrun simctl ui "$udid" appearance "$original_appearance" || true
    xcrun simctl ui "$udid" content_size "$original_size" || true
    xcrun simctl status_bar "$udid" clear || true
    $was_booted || xcrun simctl shutdown "$udid" || true
  }
  trap restore EXIT

  xcrun simctl status_bar "$udid" override --time 9:41 --dataNetwork wifi --wifiMode active --wifiBars 3 \
    --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100
  xcrun simctl ui "$udid" content_size "$content_size"

  for theme in "${themes[@]}"; do
    echo "Capturing ${device} · ${theme}${suffix}…"
    xcrun simctl ui "$udid" appearance "$theme"
    TEST_RUNNER_BFHR_CAPTURE_DIR="$out_dir" TEST_RUNNER_BFHR_CAPTURE_SUFFIX="$theme$suffix" \
      xcodebuild test-without-building "${xcodebuild_args[@]}" -destination "platform=iOS Simulator,id=$udid" \
      -only-testing:BruteForceHRUITests/ScreenCaptureTests
    for tab in today jobs tracker cvs mail; do echo "$out_dir/$tab-$theme$suffix.png"; done
  done

  restore
  trap - EXIT
done
