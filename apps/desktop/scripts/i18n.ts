// i18n catalogs (src/i18n): English comes from the code, Turkish and German are translated by hand.
//
//   node scripts/i18n.ts extract   writes src/i18n/en.json from every defineMessages / formatMessage
//                                  `defaultMessage` in src (formatjs extract)
//   node scripts/i18n.ts check     fails when en.json is missing a key from the code (or is stale),
//                                  has keys the code no longer uses, when any message isn't valid
//                                  ICU, when tr/de have unknown keys or different {arguments};
//                                  reports keys still missing in tr/de (`--strict` fails on them)
// Runs on Node 22 type stripping.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";

const appDir = path.resolve(import.meta.dirname, "..");
const i18nDir = path.join(appDir, "src/i18n");
const [command, ...flags] = process.argv.slice(2);

type Catalog = Record<string, string>;

function extract(outFile: string): void {
  execFileSync(
    process.execPath,
    [
      path.join(appDir, "node_modules/@formatjs/cli/bin/formatjs"),
      "extract",
      "src/**/*.{ts,tsx}",
      "--ignore",
      "src/**/*.test.ts",
      "--format",
      "simple",
      "--throws",
      "--out-file",
      outFile,
    ],
    { cwd: appDir, stdio: ["ignore", "ignore", "inherit"] },
  );
  // Stable order keeps diffs readable.
  const catalog = JSON.parse(readFileSync(outFile, "utf8")) as Catalog;
  const sorted = Object.fromEntries(Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(outFile, `${JSON.stringify(sorted, null, 2)}\n`);
}

const read = (language: string): Catalog =>
  JSON.parse(readFileSync(path.join(i18nDir, `${language}.json`), "utf8")) as Catalog;

/** The `{argument}` names a message uses (plural / select / number / date / tags included). */
function argumentsOf(elements: readonly MessageFormatElement[], into = new Set<string>()): Set<string> {
  for (const element of elements) {
    if (element.type === TYPE.literal || element.type === TYPE.pound) continue;
    into.add(element.value);
    if (element.type === TYPE.plural || element.type === TYPE.select)
      for (const option of Object.values(element.options)) argumentsOf(option.value, into);
    if (element.type === TYPE.tag) argumentsOf(element.children, into);
  }
  return into;
}

if (command === "extract") {
  extract(path.join(i18nDir, "en.json"));
  console.log(`i18n: wrote src/i18n/en.json (${Object.keys(read("en")).length} messages)`);
} else if (command === "check") {
  const errors: string[] = [];
  const warnings: string[] = [];
  const tmp = mkdtempSync(path.join(tmpdir(), "bfhr-i18n-"));
  let fromCode: Catalog;
  try {
    extract(path.join(tmp, "en.json"));
    fromCode = JSON.parse(readFileSync(path.join(tmp, "en.json"), "utf8")) as Catalog;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  const en = read("en");
  for (const [id, message] of Object.entries(fromCode)) {
    if (!(id in en)) errors.push(`en.json is missing "${id}" (run pnpm i18n:extract)`);
    else if (en[id] !== message) errors.push(`en.json is stale for "${id}" (run pnpm i18n:extract)`);
  }
  for (const id of Object.keys(en))
    if (!(id in fromCode)) errors.push(`en.json has "${id}", which no code uses`);

  const enArguments = new Map<string, Set<string>>();
  for (const [id, message] of Object.entries(en)) {
    try {
      enArguments.set(id, argumentsOf(parse(message)));
    } catch (error) {
      errors.push(`en "${id}": invalid ICU message (${String(error)})`);
    }
  }
  for (const language of ["tr", "de"]) {
    const catalog = read(language);
    const missing = Object.keys(en).filter((id) => !(id in catalog));
    if (missing.length > 0)
      warnings.push(`${language}: ${missing.length} untranslated: ${missing.join(", ")}`);
    for (const [id, message] of Object.entries(catalog)) {
      const expected = enArguments.get(id);
      if (!(id in en)) {
        errors.push(`${language}.json has "${id}", which isn't in en.json`);
        continue;
      }
      try {
        const actual = argumentsOf(parse(message));
        if (expected && [...expected].sort().join() !== [...actual].sort().join())
          errors.push(
            `${language} "${id}": arguments {${[...actual].join(", ")}} ≠ en {${[...expected].join(", ")}}`,
          );
      } catch (error) {
        errors.push(`${language} "${id}": invalid ICU message (${String(error)})`);
      }
    }
  }

  for (const warning of warnings) console.warn(`⚠ ${warning}`);
  if (errors.length > 0) {
    for (const error of errors) console.error(`✗ ${error}`);
    process.exit(1);
  }
  if (flags.includes("--strict") && warnings.length > 0) process.exit(1);
  console.log(`✓ i18n: ${Object.keys(en).length} messages; catalogs valid`);
} else {
  console.error("Usage: node scripts/i18n.ts extract|check [--strict]");
  process.exit(2);
}
