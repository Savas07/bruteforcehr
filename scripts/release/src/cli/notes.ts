/**
 * Writes the release notes for `--version` to `--out`, from the CHANGELOG.md files Changesets
 * wrote when versioning. `--pending` uses the not-yet-versioned `.changeset/*.md` summaries
 * instead (dry runs before the "Version packages" PR is merged).
 *
 *   tsx src/cli/notes.ts --root ../.. --version 0.1.0 --out notes.md [--pending]
 */
import { globSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { changelogEntries, changesetSummary, releaseNotes } from "../notes";
import { parseVersion } from "../version";

const { values } = parseArgs({
  options: {
    root: { type: "string", default: "." },
    version: { type: "string" },
    out: { type: "string" },
    pending: { type: "boolean", default: false },
  },
});
if (values.version === undefined || values.out === undefined)
  throw new Error("--version and --out are required");
const { version } = parseVersion(values.version);

// Every workspace package (pnpm-workspace.yaml) has its own CHANGELOG.md once versioned.
const changelogs = [
  "apps/*/CHANGELOG.md",
  "packages/*/CHANGELOG.md",
  "firebase/tests/CHANGELOG.md",
  "scripts/release/CHANGELOG.md",
];
const entries = values.pending
  ? globSync(".changeset/*.md", { cwd: values.root })
      .filter((file) => !file.endsWith("README.md"))
      .sort()
      .map((file) => changesetSummary(readFileSync(join(values.root, file), "utf8")))
  : globSync(changelogs, { cwd: values.root })
      .sort()
      .flatMap((file) => changelogEntries(readFileSync(join(values.root, file), "utf8"), version));

if (!values.pending && entries.length === 0) {
  const found = globSync(changelogs, { cwd: values.root }).some((file) =>
    readFileSync(join(values.root, file), "utf8").includes(`\n## ${version}\n`),
  );
  if (!found) throw new Error(`No CHANGELOG.md has a "## ${version}" section; run "changeset version" first`);
}

const notes = releaseNotes(entries);
writeFileSync(values.out, `${notes}\n`);
console.log(notes);
