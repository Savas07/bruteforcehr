// Writes conformance/populated.json and conformance/empty.json: the fixture datasets as
// Firestore-shaped documents (ISO-8601 dates) that the BFHRCore Swift tests decode and round-trip.
// `scripts/conformance.test.ts` fails when the committed files are stale.
import { writeFile } from "node:fs/promises";
import { conformanceDocuments } from "./documents";

for (const [name, document] of Object.entries(conformanceDocuments())) {
  await writeFile(
    new URL(`../conformance/${name}.json`, import.meta.url),
    `${JSON.stringify(document, null, 2)}\n`,
  );
}
console.log("fixtures: wrote conformance/populated.json and conformance/empty.json");
