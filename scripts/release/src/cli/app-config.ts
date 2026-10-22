/**
 * Writes `appConfig/{platform}` for a published stable release with the Admin SDK (Application
 * Default Credentials: the `github-deployer` service account via Workload Identity Federation in
 * CI). `--dry-run` reads the current documents (proving Firestore access) and prints what it would
 * write.
 *
 *   tsx src/cli/app-config.ts --version 0.1.0 --platforms macos,windows,ios [--dry-run]
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { PlatformSchema } from "@bfhr/core";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { MinSupportedVersionsSchema, buildAppConfig } from "../app-config";
import { parseVersion } from "../version";

const { values } = parseArgs({
  options: {
    version: { type: "string" },
    platforms: { type: "string" },
    project: { type: "string", default: "bruteforcehr" },
    "dry-run": { type: "boolean", default: false },
  },
});
if (values.version === undefined || values.platforms === undefined) {
  throw new Error("--version and --platforms are required");
}
const release = parseVersion(values.version);
if (release.channel !== "stable") {
  throw new Error(`${release.version} is a beta; appConfig only advertises stable releases`);
}
const platforms = values.platforms
  .split(",")
  .filter((platform) => platform.length > 0)
  .map((platform) => PlatformSchema.parse(platform));
const minSupported = MinSupportedVersionsSchema.parse(
  JSON.parse(readFileSync(new URL("../../min-supported-versions.json", import.meta.url), "utf8")),
);

const db = getFirestore(initializeApp({ projectId: values.project }));
const now = new Date();
const batch = db.batch();
for (const platform of platforms) {
  const ref = db.collection("appConfig").doc(platform);
  const existing = await ref.get();
  const { id: _id, ...doc } = buildAppConfig({
    platform,
    version: release.version,
    minSupportedVersion: minSupported[platform],
    featureFlags: existing.get("featureFlags") as Record<string, boolean> | undefined,
    now,
  });
  console.log(
    `appConfig/${platform} (${existing.exists ? `currently ${String(existing.get("latestVersion"))}` : "new"}) -> ${JSON.stringify(doc)}`,
  );
  batch.set(ref, doc);
}

if (values["dry-run"]) {
  console.log("Dry run: nothing written.");
} else {
  await batch.commit();
  console.log(`Wrote appConfig for ${platforms.join(", ")}.`);
}
