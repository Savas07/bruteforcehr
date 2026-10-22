// Writes the committed Swift package swift/BFHRDesignTokens from src/. Commit the result.
import { swiftPackageDir, writeSwiftPackage } from "./swift-package.ts";

const count = await writeSwiftPackage();
console.log(`ui-tokens: wrote ${count} files to ${swiftPackageDir}`);
