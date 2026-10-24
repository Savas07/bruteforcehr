import { firestorePaths } from "@bfhr/api";
import { type Job, JOB_EMBEDDING_FIELD, isSameJob, mergeJobListing } from "@bfhr/core";
import { FieldValue, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore";
import { adminConverters } from "../converters";
import { type Embedder, jobEmbeddingText } from "./embeddings";

export type JobDraft = Omit<Job, "id">;

/** Firestore `in` / `array-contains-any` accept at most 30 values. */
const QUERY_CHUNK = 30;
const BATCH_LIMIT = 400;

export interface UpsertPlan {
  /** One job per distinct posting of the input, in input order (merged with what was stored). */
  jobs: Job[];
  created: string[];
  updated: string[];
}

/**
 * Dedupes a batch of drafts against itself and the user's stored jobs (ADR 0002 "Normalize +
 * dedupe"): same `sourceKey` → same job; else same fingerprint, or `isSameJob` (same company,
 * title and overlapping description) → merged listing; otherwise a new job. Pure.
 */
export function planUpserts(
  drafts: readonly JobDraft[],
  stored: readonly Job[],
  newId: () => string,
  now: Date,
): UpsertPlan {
  const pool = new Map<string, Job>(stored.map((job) => [job.id, job]));
  const created = new Set<string>();
  const touched = new Set<string>();
  const order: string[] = [];
  for (const draft of drafts) {
    const existing =
      [...pool.values()].find((job) => draft.sourceKeys.some((key) => job.sourceKeys.includes(key))) ??
      [...pool.values()].find((job) => isSameJob(job, draft));
    let job: Job;
    if (existing === undefined) {
      job = { id: newId(), ...draft, createdAt: now, updatedAt: now };
      created.add(job.id);
    } else {
      job = mergeJobListing(existing, draft, now);
      if (!created.has(job.id)) touched.add(job.id);
    }
    pool.set(job.id, job);
    if (!order.includes(job.id)) order.push(job.id);
  }
  return {
    jobs: order.flatMap((id) => {
      const job = pool.get(id);
      return job === undefined ? [] : [job];
    }),
    created: [...created],
    updated: [...touched],
  };
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

function readVector(snapshot: DocumentSnapshot): number[] | null {
  // A Firestore VectorValue (its class isn't exported by firebase-admin).
  const value = snapshot.get(JOB_EMBEDDING_FIELD) as { toArray?: () => number[] } | undefined;
  return typeof value?.toArray === "function" ? value.toArray() : null;
}

/** A stored job with its embedding (null until computed). */
export interface StoredJob {
  job: Job;
  embedding: number[] | null;
}

export interface UpsertResult {
  jobs: StoredJob[];
  created: string[];
  updated: string[];
}

/** The user's `jobs` collection: dedupe-aware upserts and embeddings (server-only field). */
export class JobStore {
  constructor(
    private readonly db: Firestore,
    private readonly uid: string,
    private readonly embedder: Embedder,
  ) {}

  /** Stored jobs sharing a source key or fingerprint with the drafts (the dedupe candidates). */
  async candidates(drafts: readonly JobDraft[]): Promise<Map<string, DocumentSnapshot>> {
    const jobs = this.db.collection(firestorePaths.jobs(this.uid));
    const keys = [...new Set(drafts.flatMap((draft) => draft.sourceKeys))];
    const fingerprints = [...new Set(drafts.map((draft) => draft.fingerprint))];
    const snapshots = await Promise.all([
      ...chunks(keys, QUERY_CHUNK).map((chunk) =>
        jobs.where("sourceKeys", "array-contains-any", chunk).get(),
      ),
      ...chunks(fingerprints, QUERY_CHUNK).map((chunk) => jobs.where("fingerprint", "in", chunk).get()),
    ]);
    const found = new Map<string, DocumentSnapshot>();
    for (const snapshot of snapshots) for (const doc of snapshot.docs) found.set(doc.id, doc);
    return found;
  }

  /** Writes new and merged jobs; computes embeddings for jobs that have none. */
  async upsert(drafts: readonly JobDraft[], now: Date): Promise<UpsertResult> {
    const found = await this.candidates(drafts);
    const stored: Job[] = [];
    const vectors = new Map<string, number[] | null>();
    for (const [id, snapshot] of found) {
      try {
        stored.push(adminConverters.job.fromSnapshot(snapshot));
        vectors.set(id, readVector(snapshot));
      } catch {
        // A document that no longer parses is left alone; the draft becomes a new job.
      }
    }
    const collection = this.db.collection(firestorePaths.jobs(this.uid));
    const plan = planUpserts(drafts, stored, () => collection.doc().id, now);
    const needEmbedding = plan.jobs.filter((job) => (vectors.get(job.id) ?? null) === null);
    const embedded =
      needEmbedding.length === 0
        ? []
        : await this.embedder.embed(needEmbedding.map(jobEmbeddingText), "RETRIEVAL_DOCUMENT");
    needEmbedding.forEach((job, index) => vectors.set(job.id, embedded[index] ?? null));

    const created = new Set(plan.created);
    const writes = plan.jobs.filter(
      (job) => created.has(job.id) || plan.updated.includes(job.id) || needEmbedding.includes(job),
    );
    for (const chunk of chunks(writes, BATCH_LIMIT)) {
      const batch = this.db.batch();
      for (const job of chunk) {
        const ref = collection.doc(job.id);
        const vector = vectors.get(job.id);
        const embedding =
          needEmbedding.includes(job) && vector !== undefined && vector !== null
            ? { [JOB_EMBEDDING_FIELD]: FieldValue.vector(vector) }
            : {};
        if (created.has(job.id)) {
          batch.set(ref, { ...adminConverters.job.toFirestore(job), ...embedding });
        } else {
          const { id: _id, createdAt: _createdAt, ...patch } = job;
          batch.update(ref, { ...adminConverters.job.toFirestoreUpdate(patch), ...embedding });
        }
      }
      await batch.commit();
    }
    return {
      jobs: plan.jobs.map((job) => ({ job, embedding: vectors.get(job.id) ?? null })),
      created: plan.created,
      updated: plan.updated,
    };
  }

  /** Loads jobs by id with their embeddings (missing or unparsable ids are skipped). */
  async load(ids: readonly string[]): Promise<StoredJob[]> {
    const refs = ids.map((id) => this.db.doc(firestorePaths.job(this.uid, id)));
    if (refs.length === 0) return [];
    const snapshots = await this.db.getAll(...refs);
    return snapshots.flatMap((snapshot) => {
      if (!snapshot.exists) return [];
      try {
        return [{ job: adminConverters.job.fromSnapshot(snapshot), embedding: readVector(snapshot) }];
      } catch {
        return [];
      }
    });
  }

  /** The most recently created jobs (fallback when there is no profile vector to search with). */
  async newest(limit: number): Promise<StoredJob[]> {
    const snapshot = await this.db
      .collection(firestorePaths.jobs(this.uid))
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();
    return snapshot.docs.flatMap((doc) => {
      try {
        return [{ job: adminConverters.job.fromSnapshot(doc), embedding: readVector(doc) }];
      } catch {
        return [];
      }
    });
  }

  /** Nearest jobs to a query vector (Firestore vector search, flat index, DOT_PRODUCT; ADR 0002). */
  async nearest(vector: readonly number[], limit: number): Promise<StoredJob[]> {
    const snapshot = await this.db
      .collection(firestorePaths.jobs(this.uid))
      .findNearest({
        vectorField: JOB_EMBEDDING_FIELD,
        queryVector: FieldValue.vector([...vector]),
        limit,
        distanceMeasure: "DOT_PRODUCT",
      })
      .get();
    return snapshot.docs.flatMap((doc) => {
      try {
        return [{ job: adminConverters.job.fromSnapshot(doc), embedding: readVector(doc) }];
      } catch {
        return [];
      }
    });
  }

  /** Computes and stores missing embeddings for already loaded jobs (client-created jobs). */
  async ensureEmbeddings(jobs: StoredJob[]): Promise<StoredJob[]> {
    const missing = jobs.filter((stored) => stored.embedding === null);
    if (missing.length === 0) return jobs;
    const vectors = await this.embedder.embed(
      missing.map((stored) => jobEmbeddingText(stored.job)),
      "RETRIEVAL_DOCUMENT",
    );
    const batch = this.db.batch();
    missing.forEach((stored, index) => {
      const vector = vectors[index];
      if (vector === undefined) return;
      stored.embedding = vector;
      batch.update(this.db.doc(firestorePaths.job(this.uid, stored.job.id)), {
        [JOB_EMBEDDING_FIELD]: FieldValue.vector(vector),
      });
    });
    await batch.commit();
    return jobs;
  }
}

/**
 * The stored job a draft duplicates (same source key, fingerprint or `isSameJob`), or null. For
 * single-posting imports (`jobImportUrl`), which then merge with `mergeJobListing`.
 */
export async function findDuplicateJob(db: Firestore, uid: string, draft: JobDraft): Promise<Job | null> {
  const store = new JobStore(db, uid, { embed: async () => [] });
  for (const snapshot of (await store.candidates([draft])).values()) {
    try {
      const job = adminConverters.job.fromSnapshot(snapshot);
      if (draft.sourceKeys.some((key) => job.sourceKeys.includes(key)) || isSameJob(job, draft)) return job;
    } catch {
      // Unparsable documents are not duplicates.
    }
  }
  return null;
}
