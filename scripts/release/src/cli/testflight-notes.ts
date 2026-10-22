/**
 * Sets TestFlight "What to Test" for the build just uploaded by the `ios` release job.
 * Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH (the .p8 written to $RUNNER_TEMP).
 *
 *   tsx src/cli/testflight-notes.ts --version 0.1.0 --build-number 42 --notes notes.md
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { appStoreConnectToken, createAscClient, setWhatToTest } from "../testflight";

const { values } = parseArgs({
  options: {
    version: { type: "string" },
    "build-number": { type: "string" },
    notes: { type: "string" },
    "bundle-id": { type: "string", default: "com.savas07.bruteforcehr" },
  },
});
const { ASC_KEY_ID: keyId, ASC_ISSUER_ID: issuerId, ASC_KEY_PATH: keyPath } = process.env;
if (!values.version || !values["build-number"] || !values.notes || !keyId || !issuerId || !keyPath) {
  throw new Error("--version, --build-number, --notes and ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH are required");
}
const privateKeyPem = readFileSync(keyPath, "utf8");
const client = createAscClient(() => appStoreConnectToken({ keyId, issuerId, privateKeyPem, now: new Date() }));
const buildId = await setWhatToTest(client, {
  bundleId: values["bundle-id"],
  marketingVersion: values.version,
  buildNumber: values["build-number"],
  notes: readFileSync(values.notes, "utf8"),
  pollIntervalMs: 30_000,
  timeoutMs: 45 * 60_000,
});
console.log(`What to Test set on build ${buildId} (${values.version} (${values["build-number"]})).`);
