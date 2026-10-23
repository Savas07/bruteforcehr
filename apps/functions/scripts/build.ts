// Bundles each functions codebase into lib/<codebase>/ for `firebase deploy`.
//
// Cloud Build runs `npm install` on the uploaded source and cannot resolve `workspace:*`
// dependencies, so workspace packages (TypeScript source) are inlined by esbuild while every
// npm dependency stays external and is listed, at its installed version, in a generated
// package.json next to the bundle: the packages the bundle imports plus their required peers
// (firebase-functions needs firebase-admin even where our code doesn't import it).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { z } from "zod";

interface PackageJson {
  version: string;
  engines: { node: string };
  dependencies: Record<string, string>;
}

/** Codebase name (firebase.json `functions[].codebase`) → entry module. */
const CODEBASES = {
  default: "src/default.ts",
  identity: "src/identity.ts",
} as const;

const packageDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const libDir = path.join(packageDir, "lib");
// Our own manifest, kept in this repo: the shape is known.
const pkg = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8")) as PackageJson;

const externalDeps = Object.keys(pkg.dependencies).filter(
  (name) => !pkg.dependencies[name]?.startsWith("workspace:"),
);

function gitShortSha(): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: packageDir,
      encoding: "utf8",
    }).trim();
  } catch {
    return undefined;
  }
}

/** Release CI sets BFHR_VERSION from the tag; local builds use package version + commit. */
const version = process.env["BFHR_VERSION"] ?? [pkg.version, gitShortSha()].filter(Boolean).join("+");

/** "firebase-admin/app" → "firebase-admin", "@scope/pkg/sub" → "@scope/pkg". */
function packageNameOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier);
}

const installedManifestSchema = z.object({
  version: z.string(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
  peerDependenciesMeta: z.record(z.string(), z.object({ optional: z.boolean().optional() })).optional(),
});

/** Manifest of the installed package, found the way Node resolves packages (walking up node_modules). */
async function installedManifest(name: string): Promise<z.infer<typeof installedManifestSchema>> {
  for (let dir = packageDir; ; dir = path.dirname(dir)) {
    const manifest = path.join(dir, "node_modules", name, "package.json");
    if (existsSync(manifest)) {
      return installedManifestSchema.parse(JSON.parse(await readFile(manifest, "utf8")));
    }
    if (path.dirname(dir) === dir) {
      throw new Error(`${name} is not installed; run pnpm install`);
    }
  }
}

/** Dotenv files (`.env.<projectId>`) carry non-secret params; the CLI reads them from the source dir. */
async function copyDotenvFiles(outDir: string): Promise<void> {
  for (const file of await readdir(packageDir)) {
    if ((/^\.env(\..+)?$/.test(file) && file !== ".env.example") || file === ".secret.local") {
      await copyFile(path.join(packageDir, file), path.join(outDir, file));
    }
  }
}

await rm(libDir, { recursive: true, force: true });

for (const [codebase, entry] of Object.entries(CODEBASES)) {
  const outDir = path.join(libDir, codebase);
  const result = await build({
    absWorkingDir: packageDir,
    entryPoints: [entry],
    outfile: path.join(outDir, "index.js"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: `node${pkg.engines.node}`,
    external: [...externalDeps, ...externalDeps.map((name) => `${name}/*`)],
    define: { __BFHR_VERSION__: JSON.stringify(version) },
    metafile: true,
    logLevel: "warning",
  });

  const imported = new Set<string>();
  for (const output of Object.values(result.metafile.outputs)) {
    for (const { path: specifier, external } of output.imports) {
      if (external && !specifier.startsWith("node:")) imported.add(packageNameOf(specifier));
    }
  }
  const dependencies: Record<string, string> = {};
  const pending = [...imported];
  for (let name = pending.shift(); name !== undefined; name = pending.shift()) {
    if (name in dependencies) continue;
    if (!externalDeps.includes(name)) {
      throw new Error(`${entry} needs ${name}, which is not a dependency of @bfhr/functions`);
    }
    const installed = await installedManifest(name);
    dependencies[name] = installed.version;
    for (const peer of Object.keys(installed.peerDependencies ?? {})) {
      if (!installed.peerDependenciesMeta?.[peer]?.optional && externalDeps.includes(peer))
        pending.push(peer);
    }
  }

  const manifest = {
    name: `bfhr-functions-${codebase}`,
    version: pkg.version,
    private: true,
    type: "module",
    main: "index.js",
    engines: pkg.engines,
    dependencies: Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))),
  };
  await writeFile(path.join(outDir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await copyDotenvFiles(outDir);
  // `firebase deploy` analyses a codebase by running `<source>/node_modules/.bin/firebase-functions`
  // (or the project root's), which pnpm's isolated layout only has in apps/functions/node_modules.
  // firebase.json's `ignore: ["node_modules"]` keeps the link out of the upload.
  await symlink(
    path.relative(outDir, path.join(packageDir, "node_modules")),
    path.join(outDir, "node_modules"),
    "dir",
  );
  console.log(
    `built ${path.relative(packageDir, outDir)} (${version}): ${Object.keys(manifest.dependencies).join(", ")}`,
  );
}
