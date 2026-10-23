// Proves a build contains no fixture data (kickoff "Data honesty"): every company, person, email
// and the fixture uid from packages/fixtures/src must be absent from the built files. Production
// builds must also not contain the Auth emulator address test builds sign in against
// (src/features/auth/firebaseAuth.ts).
//
//   node scripts/check-production-bundle.ts [dist]                     production: none may appear
//   node scripts/check-production-bundle.ts <dir> --expect-fixtures    control: a design build must
//                                                                      contain them (the check works)
// Runs on Node 22 type stripping (no build deps).
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const appDir = path.resolve(import.meta.dirname, "..");
const fixturesDir = path.resolve(appDir, "../../packages/fixtures/src");
const args = process.argv.slice(2);
const expectFixtures = args.includes("--expect-fixtures");
const distDir = path.resolve(appDir, args.find((arg) => !arg.startsWith("--")) ?? "dist");

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name));
}

/** Distinctive fixture strings: names, companies, addresses and the fixture uid. */
async function fixtureNeedles(): Promise<string[]> {
  const needles = new Set<string>();
  // Not `name`: skill and section names ("TypeScript") could legitimately appear in app code.
  const field = /\b(?:company|fullName|contactName|address|email)\s*:\s*"([^"\n]{6,})"/g;
  for (const file of await filesUnder(fixturesDir)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(field)) if (match[1]) needles.add(match[1]);
    for (const match of source.matchAll(/"(fixture-[a-z0-9-]+)"/g)) if (match[1]) needles.add(match[1]);
  }
  return [...needles];
}

const needles = await fixtureNeedles();
if (needles.length < 20)
  throw new Error(`Only ${needles.length} fixture strings found; the extractor is broken`);

const files = (await filesUnder(distDir)).filter((file) => /\.(js|mjs|css|html|json)$/.test(file));
if (files.length === 0) throw new Error(`No built files in ${distDir}; run the build first`);

const found = new Map<string, string[]>();
for (const file of files) {
  const text = await readFile(file, "utf8");
  for (const needle of needles) {
    if (!text.includes(needle)) continue;
    found.set(needle, [...(found.get(needle) ?? []), path.relative(appDir, file)]);
  }
}

const relativeDist = path.relative(appDir, distDir);
if (expectFixtures) {
  if (found.size === 0) {
    console.error(
      `✗ ${relativeDist}: expected fixture strings (control run), found none — the check can't see them`,
    );
    process.exit(1);
  }
  console.log(
    `✓ control: ${relativeDist} contains ${found.size} of ${needles.length} fixture strings, so the check detects them`,
  );
} else {
  const emulator = "127.0.0.1:9099";
  const withEmulator = [];
  for (const file of files) if ((await readFile(file, "utf8")).includes(emulator)) withEmulator.push(file);
  if (found.size > 0 || withEmulator.length > 0) {
    if (found.size > 0) console.error(`✗ ${relativeDist} contains fixture data:`);
    for (const [needle, where] of found) console.error(`  "${needle}" in ${where.join(", ")}`);
    for (const file of withEmulator)
      console.error(`✗ the Auth emulator address (${emulator}) is in ${path.relative(appDir, file)}`);
    process.exit(1);
  }
  console.log(
    `✓ ${relativeDist}: none of ${needles.length} fixture strings nor the Auth emulator address in ${files.length} built files`,
  );
}
