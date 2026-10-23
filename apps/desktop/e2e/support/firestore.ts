/**
 * The Firestore emulator from the spec's side (scripts/with-emulators.sh): reads what the app wrote
 * and plays "another device" by writing as the emulator's owner (`Bearer owner` skips the rules).
 */
import { firebaseConfig } from "../../src/lib/firebase.ts";

const BASE = `http://127.0.0.1:8080/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
const HEADERS = { Authorization: "Bearer owner", "Content-Type": "application/json" };

type Value =
  | { stringValue: string }
  | { integerValue: string }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { mapValue: { fields?: Record<string, Value> } }
  | { arrayValue: { values?: Value[] } };

export interface FirestoreDoc {
  readonly name: string;
  readonly fields: Record<string, Value>;
}

/** Plain JS value of a Firestore REST value. */
export function plain(value: Value | undefined): unknown {
  if (value === undefined) return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields ?? {}).map(([key, inner]) => [key, plain(inner)]),
    );
  }
  return (value.arrayValue.values ?? []).map(plain);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: HEADERS });
  if (!response.ok)
    throw new Error(`${init?.method ?? "GET"} ${url}: ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

/** The CV titled `title` (any user), with its path. */
export async function findCv(title: string): Promise<FirestoreDoc | null> {
  const results = await request<{ document?: FirestoreDoc }[]>(`${BASE}:runQuery`, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "cvs", allDescendants: true }],
        where: { fieldFilter: { field: { fieldPath: "title" }, op: "EQUAL", value: { stringValue: title } } },
      },
    }),
  });
  return results.find((result) => result.document)?.document ?? null;
}

/** Path below `documents/` of a REST document name. */
const relative = (name: string) => name.slice(name.indexOf("/documents/") + "/documents/".length);

export async function getDoc(path: string): Promise<FirestoreDoc> {
  return request<FirestoreDoc>(`${BASE}/${path}`);
}

export async function listRevisions(cvPath: string): Promise<FirestoreDoc[]> {
  const { documents } = await request<{ documents?: FirestoreDoc[] }>(
    `${BASE}/${relative(cvPath)}/revisions?pageSize=300`,
  );
  return documents ?? [];
}

/** The summary text of a revision document. */
export function summaryOf(revision: FirestoreDoc): string | undefined {
  const summary = plain(mapFields(mapFields(revision.fields["content"])["basics"])["summary"]);
  return typeof summary === "string" ? summary : undefined;
}

/**
 * Another device saves the CV: a new revision with `summary`, the CV pointing at it with
 * `version + 1` (the same write the apps make).
 */
export async function remoteEdit(cvName: string, summary: string): Promise<string> {
  const cvPath = relative(cvName);
  const cv = await getDoc(cvPath);
  const current = await getDoc(`${cvPath}/revisions/${String(plain(cv.fields["currentRevisionId"]))}`);
  const fields = structuredClone(current.fields);
  // content.basics.summary, keeping every other stored field as it is.
  const content = mapFields(fields["content"]);
  const basics = mapFields(content["basics"]);
  basics["summary"] = { stringValue: summary };
  content["basics"] = { mapValue: { fields: basics } };
  fields["content"] = { mapValue: { fields: content } };
  fields["basedOnRevisionId"] = { stringValue: current.name.split("/").at(-1) ?? "" };
  fields["createdAt"] = { timestampValue: new Date().toISOString() };
  const created = await request<FirestoreDoc>(`${BASE}/${cvPath}/revisions`, {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  const revisionId = created.name.split("/").at(-1) ?? "";
  const version = Number(plain(cv.fields["version"]));
  await request(
    `${BASE}/${cvPath}?updateMask.fieldPaths=currentRevisionId&updateMask.fieldPaths=version&updateMask.fieldPaths=updatedAt`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          currentRevisionId: { stringValue: revisionId },
          version: { integerValue: String(version + 1) },
          updatedAt: { timestampValue: new Date().toISOString() },
        },
      }),
    },
  );
  return revisionId;
}

/** The fields of a map value (empty for anything else). */
function mapFields(value: Value | undefined): Record<string, Value> {
  return value !== undefined && "mapValue" in value ? { ...value.mapValue.fields } : {};
}

/** Documents of `collectionId` (any user) whose `field` equals `value`. */
export async function findDocs(collectionId: string, field: string, value: string): Promise<FirestoreDoc[]> {
  const results = await request<{ document?: FirestoreDoc }[]>(`${BASE}:runQuery`, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId, allDescendants: true }],
        where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: value } } },
      },
    }),
  });
  return results.flatMap((result) => (result.document ? [result.document] : []));
}

/** The document id of a REST document name. */
export const docId = (doc: FirestoreDoc) => doc.name.split("/").at(-1) ?? "";
