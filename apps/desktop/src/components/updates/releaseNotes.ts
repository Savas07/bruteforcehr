/**
 * Release notes arrive as the Changesets markdown of the GitHub release (`latest.json` → `notes`).
 * The dialog shows them as plain blocks: headings, bullet lists and paragraphs, with inline
 * markdown reduced to its text. No HTML is ever rendered from the manifest.
 */

export type NotesBlock =
  | { readonly kind: "heading"; readonly text: string }
  | { readonly kind: "list"; readonly items: readonly string[] }
  | { readonly kind: "paragraph"; readonly text: string };

/** `[text](url)` → text, `**bold**`/`_em_`/`` `code` `` → their text, and Changesets' leading commit hash. */
function plain(text: string): string {
  return text
    .replace(/^[0-9a-f]{7,40}:\s+/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|\*|_|`)(.+?)\1/g, "$2")
    .trim();
}

export function parseReleaseNotes(markdown: string): readonly NotesBlock[] {
  const blocks: NotesBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", text: plain(paragraph.join(" ")) });
    paragraph = [];
    if (list && list.length > 0) blocks.push({ kind: "list", items: list });
    list = null;
  };
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const item = /^[-*+]\s+(.*)$/.exec(line);
    if (line === "") flush();
    else if (heading) {
      flush();
      blocks.push({ kind: "heading", text: plain(heading[1] ?? "") });
    } else if (item) {
      if (paragraph.length > 0) flush();
      list ??= [];
      list.push(plain(item[1] ?? ""));
    } else if (list && raw.startsWith(" ")) {
      // A wrapped bullet continues the previous item.
      list[list.length - 1] = `${list[list.length - 1] ?? ""} ${plain(line)}`.trim();
    } else {
      if (list) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks.filter((block) => block.kind !== "heading" || block.text !== "");
}
