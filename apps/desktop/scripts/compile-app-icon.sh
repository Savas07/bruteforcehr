#!/usr/bin/env bash
# CI (macOS runners): compiles the Icon Composer icon (src-tauri/icons/AppIcon.icon) to Assets.car
# with actool and prints the path of a Tauri config overlay whose bundle.icon uses that Assets.car
# instead of the .icon. Tauri copies a listed .car into the app as is (tauri-bundler
# create_assets_car_file), so the app keeps the same Liquid Glass icon and CFBundleIconName.
#
# Why: on GitHub's macos-26 runners (Xcode 26.6), the actool that `tauri build` starts throws
# "-[__NSPlaceholderArray initWithObjects:count:]: attempt to insert nil object" on this icon in
# every run, while the same actool call from a shell compiles it (debug runs 39891582181,
# 39891883545, 39892408284, 39892805795; docs/runbooks/release.md "App icon in CI builds").
# Local builds keep using the .icon directly.
#
#   conf=$(scripts/compile-app-icon.sh "$RUNNER_TEMP/app-icon")
#   pnpm tauri build … --config "$conf"
set -euo pipefail

out=${1:?usage: compile-app-icon.sh <output-dir>}
tauri_dir=$(cd "$(dirname "$0")/../src-tauri" && pwd)
mkdir -p "$out/car"

actool "$tauri_dir/icons/AppIcon.icon" --compile "$out/car" \
  --output-format human-readable-text --errors --warnings \
  --output-partial-info-plist "$out/car/assetcatalog_generated_info.plist" \
  --app-icon AppIcon --include-all-app-icons --enable-on-demand-resources NO \
  --development-region en --target-device mac --minimum-deployment-target 26.0 --platform macosx >&2
test -s "$out/car/Assets.car"

jq --arg car "$out/car/Assets.car" \
  '{bundle: {icon: (.bundle.icon | map(if endswith(".icon") then $car else . end))}}' \
  "$tauri_dir/tauri.conf.json" > "$out/app-icon.conf.json"
echo "$out/app-icon.conf.json"
