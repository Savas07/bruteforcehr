// The "server" engine of the parity check: prints every parity case with the Cloud Functions renderer
// (apps/functions/scripts/print-local.ts, the code of cvRenderPdf). On Linux x64 (CI) that is
// @sparticuz/chromium, the binary the function runs; on macOS chrome-headless-shell of the same
// version. scripts/parity.ts compares the PDFs on macOS (BFHR_PARITY_SERVER_DIR, or it calls this).
// Usage: pnpm --filter @bfhr/cv-render parity:server <out dir>   → <out dir>/<case>.pdf + version.txt
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PARITY_CASES } from "./parity-cases";

/** Writes `<out>/<case>.pdf` for every case and `<out>/version.txt`; returns the version line. */
export async function printServerPdfs(out: string): Promise<string> {
  await mkdir(out, { recursive: true });
  for (const { name, result } of PARITY_CASES) await writeFile(join(out, `${name}.html`), result.html);
  const manifest = join(out, "manifest.json");
  await writeFile(
    manifest,
    JSON.stringify(
      PARITY_CASES.map(({ name }) => ({ html: join(out, `${name}.html`), pdf: join(out, `${name}.pdf`) })),
    ),
  );
  const printed = execFileSync("pnpm", ["--filter", "@bfhr/functions", "--silent", "print:local", manifest], {
    cwd: fileURLToPath(new URL("../../..", import.meta.url)),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
  const version = `${printed} on ${process.platform}/${process.arch}`;
  await writeFile(join(out, "version.txt"), `${version}\n`);
  return version;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (out === undefined) {
    console.error("usage: parity-server <out dir>");
    process.exit(2);
  }
  console.log(`${PARITY_CASES.length} PDFs in ${resolve(out)}: ${await printServerPdfs(resolve(out))}`);
}
