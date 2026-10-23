/**
 * Release notes from Changesets output. All workspace packages share one version (a `fixed` group
 * in .changeset/config.json), and one changeset that touches several packages appears in each of
 * their CHANGELOG.md files, so the entries are merged and de-duplicated. Dependency bumps
 * ("Updated dependencies …" or a bare `- @bfhr/core@0.1.0` list) are bookkeeping, not changes,
 * and are dropped.
 */

const COMMIT_PREFIX = /^- (?:[0-9a-f]{7,40}: )?/;
const DEPENDENCY_BUMP = /^- (?:Updated dependencies|@[\w.-]+\/[\w.-]+@\d)/;

/** Bullet entries of one `## <version>` section of a Changesets CHANGELOG.md. */
export function changelogEntries(changelog: string, version: string): string[] {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) return [];
  const entries: string[] = [];
  let current: string[] | null = null;
  const flush = () => {
    if (current) entries.push(current.join("\n").trimEnd());
    current = null;
  };
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    if (line.startsWith("- ")) {
      flush();
      current = [line.replace(COMMIT_PREFIX, "- ")];
    } else if (current && (line.startsWith("  ") || line.trim() === "")) {
      current.push(line);
    } else {
      flush();
    }
  }
  flush();
  return entries.filter((entry) => !DEPENDENCY_BUMP.test(entry));
}

/** Summaries of pending changesets (`.changeset/*.md` bodies after the front matter). */
export function changesetSummary(changeset: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/.exec(changeset);
  if (!match?.[1]) throw new Error("Changeset has no front matter");
  return match[1].trim();
}

/** Merges entries into the release notes (Markdown). */
export function releaseNotes(entries: readonly string[]): string {
  const unique = [...new Set(entries.map((entry) => entry.trim()).filter((entry) => entry.length > 0))];
  if (unique.length === 0) return "Maintenance release: no user-facing changes.";
  return unique
    .map((entry) => (entry.startsWith("- ") ? entry : `- ${entry.replace(/\n/g, "\n  ")}`))
    .join("\n");
}
