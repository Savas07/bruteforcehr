// Reads, compares and writes the committed Swift package against `renderSwiftPackage()`.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { renderSwiftPackage, swiftPackageName } from "../src/swift.ts";

export const swiftPackageDir = fileURLToPath(new URL(`../swift/${swiftPackageName}/`, import.meta.url));

/** Local build state SwiftPM and Xcode create next to the sources; never compared or committed. */
const ignored: Record<string, true> = { ".build": true, ".swiftpm": true, ".DS_Store": true };

async function listFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true, recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(swiftPackageDir, join(entry.parentPath, entry.name)))
    .filter((path) => !path.split("/").some((part) => ignored[part]));
}

export interface SwiftPackageDrift {
  missing: string[];
  changed: string[];
  extra: string[];
}

/** Differences between the committed package and the generator (all empty = in sync). */
export async function swiftPackageDrift(): Promise<SwiftPackageDrift> {
  const expected = renderSwiftPackage();
  const onDisk = await listFiles(swiftPackageDir);
  const drift: SwiftPackageDrift = { missing: [], changed: [], extra: [] };
  for (const [path, contents] of Object.entries(expected)) {
    if (!onDisk.includes(path)) drift.missing.push(path);
    else if ((await readFile(join(swiftPackageDir, path), "utf8")) !== contents) drift.changed.push(path);
  }
  drift.extra = onDisk.filter((path) => !(path in expected));
  return drift;
}

/** Rewrites the package: generated sources are replaced wholesale, local build state is kept. */
export async function writeSwiftPackage(): Promise<number> {
  const files = renderSwiftPackage();
  await rm(join(swiftPackageDir, "Sources"), { recursive: true, force: true });
  for (const [path, contents] of Object.entries(files)) {
    const target = join(swiftPackageDir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  return Object.keys(files).length;
}
