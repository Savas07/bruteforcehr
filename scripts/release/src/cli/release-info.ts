/**
 * Resolves the release being built. `--tag vX.Y.Z` (tag runs) must match the version Changesets
 * wrote to the desktop app's package.json, which Tauri reads; `--version X.Y.Z` (dry runs) stamps
 * an explicit version without that check. Writes `version`, `tag`, `channel`,
 * `marketing_version` to $GITHUB_OUTPUT when set.
 *
 *   tsx src/cli/release-info.ts --tag v0.1.0 --package ../../apps/desktop/package.json
 *   tsx src/cli/release-info.ts --version 0.1.0
 */
import { appendFileSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parseTag, parseVersion } from "../version";

const { values } = parseArgs({
  options: { tag: { type: "string" }, version: { type: "string" }, package: { type: "string" } },
});

if ((values.tag === undefined) === (values.version === undefined)) {
  throw new Error("Pass exactly one of --tag or --version");
}
const release = values.tag !== undefined ? parseTag(values.tag) : parseVersion(values.version ?? "");

if (values.tag !== undefined) {
  if (values.package === undefined) throw new Error("--tag needs --package (the app version source)");
  const { version } = JSON.parse(readFileSync(values.package, "utf8")) as { version?: string };
  if (version !== release.version) {
    throw new Error(
      `Tag ${release.tag} does not match ${values.package} version ${String(version)}; tag the commit that Changesets versioned`,
    );
  }
}

const lines = [
  `version=${release.version}`,
  `tag=${release.tag}`,
  `channel=${release.channel}`,
  `marketing_version=${release.marketingVersion}`,
];
console.log(lines.join("\n"));
if (process.env["GITHUB_OUTPUT"]) appendFileSync(process.env["GITHUB_OUTPUT"], `${lines.join("\n")}\n`);
