/**
 * Keyboard shortcuts for the User guide, generated at build time from the desktop app's source so
 * the page lists exactly what the app does (docs/design/IA.md § Keyboard map):
 *
 * - The global shortcuts come from the shortcut registry (`apps/desktop/src/lib/shortcuts.ts`),
 *   which also feeds the native menu, the command palette and the in-app shortcuts sheet. The
 *   registry and the keymap helpers are loaded as real modules: transpiled with TypeScript and run
 *   with `react-intl` replaced by its identity `defineMessages`.
 * - The per-screen keys are the `useKeyBindings([...])` calls in the desktop screens, read from
 *   their syntax tree. A binding is listed when its keys and English label are static (a string,
 *   a constant or a `defineMessages` entry); hidden and computed bindings are left out, as in the
 *   app's own sheet.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { compileFunction } from "node:vm";
import ts from "typescript";

/** `apps/desktop/src`, set by astro.config.ts (a bundled chunk can't find it from its own URL). */
declare const __BFHR_DESKTOP_SRC__: string;
const desktopSrc = __BFHR_DESKTOP_SRC__;

type Platform = "macos" | "windows";
interface Chord {
  readonly key: string;
  readonly mod: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
}
interface MessageDescriptor {
  readonly id: string;
  readonly defaultMessage: string;
}
interface RegistryShortcut {
  readonly id: string;
  readonly group: string;
}
interface ShortcutsModule {
  readonly shortcuts: readonly RegistryShortcut[];
  readonly shortcutGroups: readonly string[];
  readonly shortcutMessages: Readonly<Record<string, MessageDescriptor>>;
  readonly shortcutKeys: (shortcut: RegistryShortcut) => readonly string[];
}
interface KeymapModule {
  readonly parseKeys: (keys: string | readonly string[]) => readonly (readonly Chord[])[];
  readonly chordKeycaps: (chord: Chord, platform: Platform) => string[];
}

// ─── Loading the registry as code ──────────────────────────────────────────────────────────────

const loaded = new Map<string, Record<string, unknown>>();

function resolveSource(base: string): string {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")])
    if (statSync(candidate, { throwIfNoEntry: false })?.isFile()) return candidate;
  throw new Error(`Keyboard shortcuts: can't find ${path.relative(desktopSrc, base)} in apps/desktop/src`);
}

/** Runs a framework-free desktop module (and its relative imports) in Node. */
function loadDesktopModule(file: string): Record<string, unknown> {
  const cached = loaded.get(file);
  if (cached) return cached;
  const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} as Record<string, unknown> };
  loaded.set(file, module.exports);
  const require = (specifier: string): unknown => {
    if (specifier === "react-intl") return { defineMessages: <T>(messages: T): T => messages };
    if (specifier.startsWith("."))
      return loadDesktopModule(resolveSource(path.resolve(path.dirname(file), specifier)));
    throw new Error(
      `Keyboard shortcuts: ${path.relative(desktopSrc, file)} imports ${specifier}, which the guide can't load`,
    );
  };
  compileFunction(outputText, ["exports", "require", "module"], { filename: file })(
    module.exports,
    require,
    module,
  );
  return module.exports;
}

const registry = loadDesktopModule(path.join(desktopSrc, "lib/shortcuts.ts")) as unknown as ShortcutsModule;
const keymap = loadDesktopModule(
  path.join(desktopSrc, "shared/keyboard/keymap.ts"),
) as unknown as KeymapModule;

// ─── Reading the per-screen bindings ───────────────────────────────────────────────────────────

const sourceFiles = new Map<string, ts.SourceFile>();

function parse(file: string): ts.SourceFile {
  let source = sourceFiles.get(file);
  if (!source) {
    source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    sourceFiles.set(file, source);
  }
  return source;
}

function property(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const element of object.properties) {
    if (
      ts.isPropertyAssignment(element) &&
      (ts.isIdentifier(element.name) || ts.isStringLiteral(element.name)) &&
      element.name.text === name
    )
      return element.initializer;
    if (ts.isShorthandPropertyAssignment(element) && element.name.text === name) return element.name;
  }
  return undefined;
}

/** The initializer of a top-level or local `const name = …` in `file`, or of the import it came from. */
function declaration(name: string, file: string): { init: ts.Expression; file: string } | undefined {
  const source = parse(file);
  let found: { init: ts.Expression; file: string } | undefined;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer
    )
      found = { init: node.initializer, file };
    else ts.forEachChild(node, visit);
  };
  visit(source);
  if (found) return found;
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    const bindings = statement.importClause?.namedBindings;
    if (!specifier.startsWith(".") || !bindings || !ts.isNamedImports(bindings)) continue;
    const imported = bindings.elements.find((element) => element.name.text === name);
    if (imported)
      return declaration(
        (imported.propertyName ?? imported.name).text,
        resolveSource(path.resolve(path.dirname(file), specifier)),
      );
  }
  return undefined;
}

function staticString(expression: ts.Expression, file: string): string | undefined {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
    return expression.text;
  if (ts.isIdentifier(expression)) {
    const found = declaration(expression.text, file);
    return found ? staticString(found.init, found.file) : undefined;
  }
  return undefined;
}

function staticKeys(expression: ts.Expression, file: string): string[] | undefined {
  if (ts.isArrayLiteralExpression(expression)) {
    const keys = expression.elements.map((element) => staticString(element, file));
    return keys.every((key) => key !== undefined) ? keys : undefined;
  }
  const key = staticString(expression, file);
  return key === undefined ? undefined : [key];
}

/** `messages.confirm` (a `defineMessages` entry), followed through constants and imports. */
function descriptorText(expression: ts.Expression, file: string): string | undefined {
  if (ts.isIdentifier(expression)) {
    const found = declaration(expression.text, file);
    return found ? descriptorText(found.init, found.file) : undefined;
  }
  if (!ts.isPropertyAccessExpression(expression) || !ts.isIdentifier(expression.expression)) return undefined;
  const found = declaration(expression.expression.text, file);
  if (!found || !ts.isCallExpression(found.init)) return undefined;
  const table = found.init.arguments[0];
  if (!table || !ts.isObjectLiteralExpression(table)) return undefined;
  const entry = property(table, expression.name.text);
  if (!entry || !ts.isObjectLiteralExpression(entry)) return undefined;
  const message = property(entry, "defaultMessage");
  return message ? staticString(message, found.file) : undefined;
}

/** A plain English label, or undefined when it's computed or has ICU placeholders. */
function staticLabel(expression: ts.Expression, file: string): string | undefined {
  let label: string | undefined;
  if (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === "formatMessage" &&
    expression.arguments[0]
  )
    label = descriptorText(expression.arguments[0], file);
  else if (ts.isIdentifier(expression)) {
    const found = declaration(expression.text, file);
    return found ? staticLabel(found.init, found.file) : undefined;
  } else label = staticString(expression, file);
  return label === undefined || /[{<]/u.test(label) ? undefined : label;
}

interface Binding {
  readonly label: string;
  readonly keys: readonly string[];
}

function bindingsIn(file: string): Binding[] {
  const bindings: Binding[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "useKeyBindings"
    ) {
      const list = node.arguments[0];
      if (list && ts.isArrayLiteralExpression(list))
        for (const element of list.elements) {
          if (!ts.isObjectLiteralExpression(element)) continue;
          if (property(element, "hidden")?.kind === ts.SyntaxKind.TrueKeyword) continue;
          const keysExpression = property(element, "keys");
          const labelExpression = property(element, "label");
          const keys = keysExpression && staticKeys(keysExpression, file);
          const label = labelExpression && staticLabel(labelExpression, file);
          if (keys && label) bindings.push({ label, keys });
        }
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(file));
  return bindings;
}

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.tsx?$/u.test(file) && !/\.test\.tsx?$/u.test(file))
    .map((file) => path.join(directory, file))
    .sort();
}

// ─── The guide's tables ────────────────────────────────────────────────────────────────────────

/** Guide sections in page order; each lists the desktop folders or files whose keys it shows. */
const SECTIONS: readonly {
  readonly title: string;
  readonly guide?: string;
  readonly sources: readonly string[];
}[] = [
  {
    title: "Anywhere",
    sources: [
      "shared/ui/Toast.tsx",
      "shared/ui/ExportButton.tsx",
      "features/application-add/AddApplicationHost.tsx",
    ],
  },
  { title: "Lists and panels", sources: ["shared/"] },
  { title: "Today", guide: "/guide/getting-started/#today", sources: ["features/today/"] },
  { title: "Jobs", guide: "/guide/jobs/", sources: ["features/job-detail/", "features/saved-searches/"] },
  {
    title: "Add a job from a link",
    guide: "/guide/jobs/#add-from-a-link",
    sources: ["features/jobs-import/"],
  },
  { title: "Apply by email", guide: "/guide/apply/", sources: ["features/apply/"] },
  { title: "CVs", guide: "/guide/cv-studio/", sources: ["features/cv-editor/"] },
  { title: "Tracker", guide: "/guide/tracker/", sources: ["features/tracker-"] },
  {
    title: "Add an application",
    guide: "/guide/tracker/#add-an-application",
    sources: ["features/application-add/"],
  },
  {
    title: "Application details",
    guide: "/guide/tracker/#application-details",
    sources: ["features/application-detail/"],
  },
  { title: "Mail", guide: "/guide/mail/", sources: ["features/mail-review/"] },
  { title: "Insights", guide: "/guide/insights/", sources: ["features/insights/"] },
  { title: "Settings", guide: "/guide/settings/", sources: ["features/settings/"] },
];

/** Not screens: the design harness, the registry's own hidden alternates, the keymap itself. */
const SKIPPED = ["design/", "components/AppShell.tsx", "shared/keyboard/"];

export interface ShortcutRow {
  readonly label: string;
  /** Keymap syntax (`Mod+K`, `G T`, `?`), one entry per alternative. */
  readonly keys: readonly string[];
}

export interface ShortcutTable {
  readonly id: string;
  readonly title: string;
  readonly guide?: string;
  readonly rows: readonly ShortcutRow[];
}

const slug = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");

function dedupe(rows: readonly ShortcutRow[]): ShortcutRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.label}\u0000${row.keys.join("\u0000")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Navigation and General: the registry's own groups, in its order. */
export const globalShortcutTables: readonly ShortcutTable[] = registry.shortcutGroups.map((group) => ({
  id: slug(group),
  title: group,
  rows: registry.shortcuts
    .filter((shortcut) => shortcut.group === group)
    .map((shortcut) => {
      const message = registry.shortcutMessages[shortcut.id];
      if (!message) throw new Error(`Keyboard shortcuts: no label for ${shortcut.id}`);
      return { label: message.defaultMessage, keys: registry.shortcutKeys(shortcut) };
    }),
}));

/** One table per screen. Bindings in a folder no section names get a table named after the folder. */
export const screenShortcutTables: readonly ShortcutTable[] = (() => {
  const rowsBySection = new Map<string, ShortcutRow[]>(SECTIONS.map((section) => [section.title, []]));
  const extra: ShortcutTable[] = [];
  for (const file of sourceFilesUnder(desktopSrc)) {
    const relative = path.relative(desktopSrc, file).split(path.sep).join("/");
    if (SKIPPED.some((prefix) => relative.startsWith(prefix))) continue;
    const bindings = bindingsIn(file);
    if (bindings.length === 0) continue;
    const section = SECTIONS.find((candidate) =>
      candidate.sources.some((source) => relative.startsWith(source)),
    );
    if (section) {
      rowsBySection.get(section.title)?.push(...bindings);
      continue;
    }
    const folder = relative.split("/")[1] ?? relative;
    const title = folder.charAt(0).toUpperCase() + folder.slice(1).replaceAll("-", " ");
    const table = extra.find((candidate) => candidate.title === title);
    if (table) (table.rows as ShortcutRow[]).push(...bindings);
    else extra.push({ id: slug(title), title, rows: [...bindings] });
  }
  const tables = [
    ...SECTIONS.map((section) => ({
      id: slug(section.title),
      title: section.title,
      ...(section.guide === undefined ? {} : { guide: section.guide }),
      rows: dedupe(rowsBySection.get(section.title) ?? []),
    })),
    ...extra.map((table) => ({ ...table, rows: dedupe(table.rows) })),
  ].filter((table) => table.rows.length > 0);
  const count = tables.reduce((sum, table) => sum + table.rows.length, 0);
  // A refactor that hides the bindings from this reader must not ship an empty page.
  if (count < 40)
    throw new Error(`Keyboard shortcuts: found only ${count} screen shortcuts in apps/desktop/src`);
  return tables;
})();

const SPOKEN: Readonly<Record<string, string>> = {
  "/": "Slash",
  "?": "Question mark",
  ",": "Comma",
  "=": "Equals",
  "-": "Minus",
  " ": "Space",
  Enter: "Return",
  Escape: "Escape",
  Backspace: "Delete",
  ArrowUp: "Up arrow",
  ArrowDown: "Down arrow",
  ArrowLeft: "Left arrow",
  ArrowRight: "Right arrow",
};

export interface Keystroke {
  /** Keycaps per step of a sequence (`G` then `T`), as the app draws them. */
  readonly steps: readonly (readonly string[])[];
  /** What a screen reader says: "Command Shift D", "G then T". */
  readonly spoken: string;
}

/** The keys of one alternative for a platform: `⌘ ⇧ D` on macOS, `Ctrl Shift D` on Windows. */
export function keystrokes(keys: readonly string[], platform: Platform): Keystroke[] {
  const mac = platform === "macos";
  return keymap.parseKeys(keys).map((steps) => ({
    steps: steps.map((chord) => keymap.chordKeycaps(chord, platform)),
    spoken: steps
      .map((chord) =>
        [
          chord.mod && (mac ? "Command" : "Control"),
          chord.alt && (mac ? "Option" : "Alt"),
          chord.shift && "Shift",
          SPOKEN[chord.key] === "Return" && !mac
            ? "Enter"
            : SPOKEN[chord.key] === "Delete" && !mac
              ? "Backspace"
              : (SPOKEN[chord.key] ?? chord.key.toUpperCase()),
        ]
          .filter(Boolean)
          .join(" "),
      )
      .join(" then "),
  }));
}
