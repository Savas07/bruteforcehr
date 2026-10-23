import type { Job } from "@bfhr/core";
import type { MatchCv, MatchProfile } from "@bfhr/core";
import { GoogleAuth } from "google-auth-library";

/**
 * Vertex AI text embeddings (docs/adr/0011-embeddings-matching.md): `gemini-embedding-001` in
 * europe-west1, 768 dimensions (Matryoshka truncation, re-normalized to unit length so
 * `DOT_PRODUCT` equals cosine). Authenticated as the functions service account; no API key.
 */
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;
export const EMBEDDING_LOCATION = "europe-west1";
/** Inputs per request; job texts are clipped to `EMBEDDING_TEXT_CHARS`. */
const BATCH_SIZE = 16;
export const EMBEDDING_TEXT_CHARS = 6_000;

export type EmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/** The seam the matching pipeline uses; tests substitute a deterministic fake. */
export interface Embedder {
  embed(texts: readonly string[], task: EmbeddingTask): Promise<number[][]>;
}

export function normalize(vector: readonly number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? [...vector] : vector.map((value) => value / norm);
}

export function dot(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

/** What a job is embedded from: title, company, location, skills and the start of the description. */
export function jobEmbeddingText(
  job: Pick<Job, "title" | "company" | "locations" | "skills" | "description">,
): string {
  return [
    job.title,
    job.company,
    job.locations.map((location) => location.label).join("; "),
    job.skills.join(", "),
    job.description,
  ]
    .filter((part) => part !== "")
    .join("\n")
    .slice(0, EMBEDDING_TEXT_CHARS);
}

/** The "query" side: what the person is looking for and what they can do. */
export function profileEmbeddingText(
  profile: Pick<MatchProfile, "targetRoles" | "seniority" | "skills">,
  cv: (MatchCv & { summary: string }) | null,
): string {
  return [
    `Target roles: ${profile.targetRoles.join(", ")}`,
    profile.seniority === null ? "" : `Seniority: ${profile.seniority}`,
    `Skills: ${[...new Set([...profile.skills, ...(cv?.skills ?? [])])].join(", ")}`,
    cv?.summary ?? "",
  ]
    .filter((part) => part !== "" && !part.endsWith(": "))
    .join("\n")
    .slice(0, EMBEDDING_TEXT_CHARS);
}

interface PredictResponse {
  predictions?: { embeddings?: { values?: number[] } }[];
}

export class VertexEmbedder implements Embedder {
  private readonly auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

  constructor(private readonly projectId: string) {}

  async embed(texts: readonly string[], task: EmbeddingTask): Promise<number[][]> {
    const client = await this.auth.getClient();
    const url = `https://${EMBEDDING_LOCATION}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${EMBEDDING_LOCATION}/publishers/google/models/${EMBEDDING_MODEL}:predict`;
    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      const batch = texts.slice(start, start + BATCH_SIZE);
      const response = await client.request<PredictResponse>({
        url,
        method: "POST",
        data: {
          instances: batch.map((content) => ({
            content: content.slice(0, EMBEDDING_TEXT_CHARS),
            task_type: task,
          })),
          parameters: { outputDimensionality: EMBEDDING_DIMENSIONS, autoTruncate: true },
        },
        retry: true,
      });
      const predictions = response.data.predictions ?? [];
      if (predictions.length !== batch.length) throw new Error("embedding response size mismatch");
      for (const prediction of predictions) {
        const values = prediction.embeddings?.values;
        if (values?.length !== EMBEDDING_DIMENSIONS) throw new Error("unexpected embedding dimension");
        vectors.push(normalize(values));
      }
    }
    return vectors;
  }
}
