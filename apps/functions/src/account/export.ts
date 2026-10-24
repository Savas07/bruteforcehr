import { randomBytes } from "node:crypto";
import { serverOnlyPaths, storagePaths, userDataRoots, userStoragePrefix } from "@bfhr/api";
import { ACCOUNT_EXPORT_LIMITS, type AccountExportResponse, JOB_EMBEDDING_FIELD } from "@bfhr/core";
import {
  type CollectionReference,
  type DocumentReference,
  type Firestore,
  Timestamp,
} from "firebase-admin/firestore";
import { strToU8, type Zippable, zipSync } from "fflate";

/**
 * "Export everything" (brief §4.9, docs/runbooks/account.md): every document under
 * `userDataRoots(uid)` and every Storage object under `userStoragePrefix(uid)`, as one ZIP with a
 * JSON file per collection, the stored files and a README. Secrets never leave the server.
 */

/** Collections never exported: encrypted mail credentials (`serverOnlyPaths.mailToken`). */
export const EXPORT_EXCLUDED_COLLECTIONS: Readonly<Record<string, true>> = { mailTokens: true };

/**
 * Fields dropped per collection id: device push tokens (a credential to message the device), the
 * pointer to the encrypted mail credentials, and job embeddings (server-derived vectors, large).
 */
export const EXPORT_EXCLUDED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  devices: ["pushToken"],
  mailAccounts: ["secretRef"],
  jobs: [JOB_EMBEDDING_FIELD],
};

/** The Storage bucket operations the export needs (a seam for tests). */
export interface ExportBucket {
  getFiles(options: { prefix: string }): Promise<[ExportFile[], ...unknown[]]>;
  deleteFiles(options: { prefix: string }): Promise<unknown>;
  file(path: string): {
    save(data: Uint8Array, options: Record<string, unknown>): Promise<unknown>;
  };
}

export interface ExportFile {
  name: string;
  metadata: { size?: string | number; contentType?: string };
  download(): Promise<[Buffer, ...unknown[]]>;
}

export type ExportDb = Pick<Firestore, "doc" | "getAll" | "runTransaction">;

/** Why an export was refused (`details.reason` of the callable error). */
export class ExportRefused extends Error {
  constructor(readonly reason: "export_too_soon" | "export_daily_limit" | "export_too_large") {
    super(reason);
  }
}

interface ExportedDocument {
  id: string;
  /** Path relative to its root (e.g. `cvs/abc/revisions/r1`). */
  path: string;
  data: unknown;
}

/** JSON value of a Firestore field: timestamps as ISO 8601 (UTC), bytes as base64, refs as paths. */
export function toJson(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64");
  if (Array.isArray(value)) return value.map(toJson);
  const ref = value as { path?: unknown; firestore?: unknown };
  if (typeof ref.path === "string" && ref.firestore !== undefined) return ref.path;
  const vector = value as { toArray?: () => number[] };
  if (typeof vector.toArray === "function" && value.constructor.name === "VectorValue")
    return vector.toArray();
  const geo = value as { latitude?: unknown; longitude?: unknown; constructor: { name: string } };
  if (geo.constructor.name === "GeoPoint") return { latitude: geo.latitude, longitude: geo.longitude };
  return Object.fromEntries(Object.entries(value).map(([key, field]) => [key, toJson(field)]));
}

/** Folder in the ZIP for each root: `data/` for `users/{uid}`, `data/internal/<area>/` for serverOnly. */
function rootFolder(root: string, uid: string): string {
  if (root === `users/${uid}`) return "data";
  const area = root.split("/")[1] ?? "other";
  return `data/internal/${area}`;
}

/** Collection path without document ids (`cvs/{id}/revisions` → `cvs/revisions`). */
function collectionKey(relativeCollectionPath: string): string {
  return relativeCollectionPath
    .split("/")
    .filter((_, index) => index % 2 === 0)
    .join("/");
}

async function exportTree(
  db: ExportDb,
  root: DocumentReference,
  into: Map<string, ExportedDocument[]>,
): Promise<void> {
  const rootPrefix = `${root.path}/`;
  const visit = async (collections: CollectionReference[]): Promise<void> => {
    for (const collection of collections) {
      if (EXPORT_EXCLUDED_COLLECTIONS[collection.id] === true) continue;
      // listDocuments includes "missing" parents that only hold subcollections.
      const refs = await collection.listDocuments();
      const snapshots = refs.length === 0 ? [] : await db.getAll(...refs);
      const relative = collection.path.slice(rootPrefix.length);
      const key = collectionKey(relative);
      const dropped = EXPORT_EXCLUDED_FIELDS[collection.id] ?? [];
      for (const snapshot of snapshots) {
        if (snapshot.exists) {
          const data = Object.fromEntries(
            Object.entries(snapshot.data() ?? {}).filter(([field]) => !dropped.includes(field)),
          );
          const list = into.get(key) ?? [];
          list.push({ id: snapshot.id, path: `${relative}/${snapshot.id}`, data: toJson(data) });
          into.set(key, list);
        }
        await visit(await snapshot.ref.listCollections());
      }
    }
  };
  await visit(await root.listCollections());
}

function readme(input: {
  createdAt: Date;
  jsonFiles: { name: string; count: number }[];
  files: string[];
}): string {
  const lines = [
    "# BruteForceHR export",
    "",
    `Created ${input.createdAt.toISOString()} (UTC). Everything BruteForceHR stored for your account at that moment.`,
    "",
    "## Contents",
    "",
    "- `data/profile.json`: your profile and settings.",
    "- `data/<collection>.json`: one file per collection (CVs, CV revisions, cover letters, jobs, job matches,",
    "  saved searches, followed companies, applications, application events, interviews, contacts, mail",
    "  accounts, stored job emails, devices). Each entry is `{ id, path, data }`.",
    "- `data/internal/<area>/…json`: records the service keeps about your account (AI usage per day, job",
    "  search quota, pending job alerts, recently imported job pages, mail send counters and outbox, review",
    "  corrections, mail connect attempts, export and PDF render counters).",
    "- `files/…`: the files you uploaded or created, as stored (CV imports, rendered PDFs and Word files,",
    "  CV photos, email attachments). `data/renderedFiles.json` maps each rendered file to its name.",
    "",
    "Dates are ISO 8601 in UTC. Binary values are base64.",
    "",
    "## Not included",
    "",
    "- Passwords, app passwords and sign-in tokens for your mail accounts, and device push tokens.",
    "- Emails that weren't about your job search. BruteForceHR never stored them.",
    "- Job embeddings (numeric vectors computed from job text).",
    "",
    "## Files in this export",
    "",
    ...input.jsonFiles.map((file) => `- \`${file.name}\` (${file.count})`),
    ...input.files.map((file) => `- \`${file}\``),
    "",
  ];
  return lines.join("\n");
}

const DAY_MS = 86_400_000;

/** Counts one export for today, or refuses it (spacing, daily count). */
async function admitExport(db: ExportDb, uid: string, now: Date): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  const ref = db.doc(serverOnlyPaths.accountExportDay(uid, day));
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const count = Number(snapshot.get("count") ?? 0);
    const lastAt = snapshot.get("lastAt") as Timestamp | undefined;
    if (
      lastAt !== undefined &&
      now.getTime() - lastAt.toMillis() < ACCOUNT_EXPORT_LIMITS.minIntervalSeconds * 1000
    )
      throw new ExportRefused("export_too_soon");
    if (count >= ACCOUNT_EXPORT_LIMITS.perDay) throw new ExportRefused("export_daily_limit");
    transaction.set(ref, {
      count: count + 1,
      lastAt: Timestamp.fromDate(now),
      expireAt: Timestamp.fromMillis(Date.parse(`${day}T00:00:00Z`) + 2 * DAY_MS),
    });
  });
}

/** Builds the ZIP, replaces any earlier export of the user, uploads it and returns where it is. */
export async function createExport(
  db: ExportDb,
  bucket: ExportBucket,
  uid: string,
  now: Date = new Date(),
): Promise<AccountExportResponse> {
  await admitExport(db, uid, now);

  const collections = new Map<string, Map<string, ExportedDocument[]>>();
  const profiles: unknown[] = [];
  for (const root of userDataRoots(uid)) {
    const ref = db.doc(root);
    const folder = rootFolder(root, uid);
    const [snapshot] = await db.getAll(ref);
    if (snapshot?.exists === true) {
      const data = toJson(snapshot.data());
      if (folder === "data") profiles.push(data);
      else collections.set(folder, new Map([["root", [{ id: snapshot.id, path: "", data }]]]));
    }
    const into = collections.get(folder) ?? new Map<string, ExportedDocument[]>();
    await exportTree(db, ref, into);
    collections.set(folder, into);
  }

  const exportsPrefix = storagePaths.accountExports(uid);
  const prefix = userStoragePrefix(uid);
  const [allFiles] = await bucket.getFiles({ prefix });
  const files = allFiles.filter((file) => !file.name.startsWith(exportsPrefix) && !file.name.endsWith("/"));
  const fileBytes = files.reduce((sum, file) => sum + Number(file.metadata.size ?? 0), 0);
  if (fileBytes > ACCOUNT_EXPORT_LIMITS.maxBytes) throw new ExportRefused("export_too_large");

  const zippable: Zippable = {};
  const jsonFiles: { name: string; count: number }[] = [];
  let documentCount = 0;
  if (profiles.length > 0) {
    zippable["data/profile.json"] = strToU8(JSON.stringify(profiles[0], null, 2));
    jsonFiles.push({ name: "data/profile.json", count: 1 });
    documentCount += 1;
  }
  for (const [folder, byKey] of collections) {
    for (const [key, documents] of [...byKey].sort(([a], [b]) => a.localeCompare(b))) {
      const name = `${folder}/${key}.json`;
      zippable[name] = strToU8(JSON.stringify(documents, null, 2));
      jsonFiles.push({ name, count: documents.length });
      documentCount += documents.length;
    }
  }
  const fileNames: string[] = [];
  for (const file of files) {
    const [bytes] = await file.download();
    const name = `files/${file.name.slice(prefix.length)}`;
    // PDFs, DOCX and images are already compressed.
    zippable[name] = [new Uint8Array(bytes), { level: 0 }];
    fileNames.push(name);
  }
  zippable["README.md"] = strToU8(readme({ createdAt: now, jsonFiles, files: fileNames }));
  const zip = zipSync(zippable, { level: 6, mtime: now });
  if (zip.byteLength > ACCOUNT_EXPORT_LIMITS.maxBytes) throw new ExportRefused("export_too_large");

  const stamp = now.toISOString().replace(/[-:]/g, "").slice(0, 15);
  const exportId = `${stamp}-${randomBytes(4).toString("hex")}`;
  const fileName = `BruteForceHR-export-${now.toISOString().slice(0, 10)}.zip`;
  const storagePath = storagePaths.accountExport(uid, exportId);
  // One export at a time: earlier ZIPs go now instead of waiting for the lifecycle rule.
  await bucket.deleteFiles({ prefix: exportsPrefix });
  await bucket.file(storagePath).save(zip, {
    resumable: false,
    contentType: "application/zip",
    metadata: {
      contentDisposition: `attachment; filename="${fileName}"`,
      cacheControl: "private, no-store",
    },
  });
  return {
    exportId,
    storagePath,
    fileName,
    sizeBytes: zip.byteLength,
    documentCount,
    fileCount: fileNames.length,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ACCOUNT_EXPORT_LIMITS.availableDays * 86_400_000).toISOString(),
  };
}
