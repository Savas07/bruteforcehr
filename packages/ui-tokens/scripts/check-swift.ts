// Fails (exit 1) when the committed Swift package differs from what src/ generates.
import { swiftPackageDir, swiftPackageDrift } from "./swift-package.ts";

const { missing, changed, extra } = await swiftPackageDrift();
const problems = [
  ...missing.map((path) => `missing  ${path}`),
  ...changed.map((path) => `changed  ${path}`),
  ...extra.map((path) => `extra    ${path}`),
];
if (problems.length > 0) {
  console.error(`ui-tokens: ${swiftPackageDir} is out of date with src/:`);
  for (const line of problems) console.error(`  ${line}`);
  console.error("Run `pnpm --filter @bfhr/ui-tokens generate:swift` and commit the result.");
  process.exit(1);
}
console.log("ui-tokens: Swift package matches the generator");
