#!/bin/sh
# Xcode build phase "Copy cv-render bundle" (docs/adr/0009-cv-studio.md).
#
# Copies packages/cv-render/dist/cv-render.iife.js into the app's resources, where
# CVRenderEngine.bundled() loads it into JavaScriptCore. Fails the build when the bundle is
# missing or stale: `pnpm --filter @bfhr/cv-render build` writes, next to the bundle,
#   cv-render.iife.inputs.xcfilelist  every esbuild input as $(SRCROOT)/../../<repo path>
#   cv-render.iife.inputs.sha256      sha256 over "<repo path>\n<sha256 of the file>\n" per input
# and this script recomputes the hash from the inputs as they are now. The .xcfilelist is the
# phase's input file list, so the script sandbox may read exactly those files.
set -eu

repo_root="${SRCROOT}/../.."
dist="${repo_root}/packages/cv-render/dist"
bundle="${dist}/cv-render.iife.js"
list="${dist}/cv-render.iife.inputs.xcfilelist"
stamp="${dist}/cv-render.iife.inputs.sha256"
rebuild="Run: pnpm install && pnpm --filter @bfhr/cv-render build"

for file in "$bundle" "$list" "$stamp"; do
  if [ ! -f "$file" ]; then
    echo "error: cv-render bundle missing (${file#"$repo_root"/}). ${rebuild}"
    exit 1
  fi
done

actual=$(
  while IFS= read -r line || [ -n "$line" ]; do
    [ -n "$line" ] || continue
    relative="${line#\$(SRCROOT)/../../}"
    path="${repo_root}/${relative}"
    if [ ! -f "$path" ]; then
      echo "error: cv-render input ${relative} is gone; the bundle is stale. ${rebuild}" >&2
      exit 1
    fi
    printf '%s\n%s\n' "$relative" "$(shasum -a 256 "$path" | cut -d ' ' -f 1)"
  done <"$list" | shasum -a 256 | cut -d ' ' -f 1
)
expected=$(tr -d ' \n' <"$stamp")

if [ "$actual" != "$expected" ]; then
  echo "error: cv-render bundle is stale (its sources changed since it was built). ${rebuild}"
  exit 1
fi

mkdir -p "${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}"
cp "$bundle" "${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/cv-render.iife.js"
