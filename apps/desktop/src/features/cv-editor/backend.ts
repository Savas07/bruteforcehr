/**
 * What the CV editor writes, as one interface: the app implements it on Firestore
 * (`firestoreBackend.ts`), the design build and tests in memory (`memoryBackend.ts`). Both
 * follow the same write semantics (shared with the iOS app):
 *
 * - A save is one atomic batch: create `revisions/{new}` + update `cvs/{id}` with
 *   `currentRevisionId`, the mirrored `templateId`/`theme`, `updatedAt` and `version + 1`.
 *   No transactions (they fail offline); the security rules accept only `version + 1`, so a
 *   batch built on a stale version is rejected when it reaches the server. That rejection is the
 *   conflict: the content is then kept as an orphan revision (revisions are create-only) and
 *   `CvConflictError` names it, so "Keep this version" can point the CV at it later.
 * - Restore and accepted AI suggestions are new revisions too (history is append-only).
 */
import type { Cv, CvContent, CvRevisionSource } from "@bfhr/core";
import { createContext, useContext } from "react";

export class CvConflictError extends Error {
  constructor(
    /** Our content, stored as a revision the CV doesn't point at. */
    readonly orphanRevisionId: string,
  ) {
    super("The CV changed on another device");
    this.name = "CvConflictError";
  }
}

export interface NewCvInput {
  readonly title: string;
  readonly language: string;
  readonly content: CvContent;
  readonly parentCvId: string | null;
  /** The revision the content came from (a copy or variant's source), else null. */
  readonly basedOnRevisionId: string | null;
  readonly source: CvRevisionSource;
  readonly importedFrom: Cv["importedFrom"];
  readonly diffSummary: string | null;
}

export interface CommitInput {
  /** The CV as the edit last saw it: its `version` is what the write increments. */
  readonly cv: Pick<Cv, "id" | "version">;
  readonly content: CvContent;
  readonly basedOnRevisionId: string | null;
  readonly source: CvRevisionSource;
  readonly diffSummary: string | null;
}

/** A write applied locally at once; `done` settles when the server accepted (or rejected) it. */
export interface PendingWrite<Id extends object = object> {
  readonly ids: Id;
  readonly done: Promise<void>;
}

export type CvMetadataPatch = Partial<Pick<Cv, "title" | "archivedAt" | "isDefault">>;

export interface CvStudioBackend {
  readonly uid: string;
  createCv(input: NewCvInput): PendingWrite<{ readonly cvId: string; readonly revisionId: string }>;
  /** `done` rejects with `CvConflictError` when the CV moved on meanwhile. */
  commitRevision(input: CommitInput): PendingWrite<{ readonly revisionId: string }>;
  /** "Keep this version": points the CV at an existing revision (an orphan from a conflict). */
  adoptRevision(cv: Pick<Cv, "id" | "version">, revisionId: string, content: CvContent): PendingWrite;
  updateCv(cv: Pick<Cv, "id" | "version">, patch: CvMetadataPatch): PendingWrite;
}

export const CvBackendContext = createContext<CvStudioBackend | null>(null);

export function useCvBackend(): CvStudioBackend {
  const backend = useContext(CvBackendContext);
  if (!backend) throw new Error("useCvBackend outside CvBackendContext");
  return backend;
}

/** What `cvs/{id}` mirrors from the current revision's `meta` (list views read it). */
export function mirroredDesign(content: CvContent): Pick<Cv, "templateId" | "theme"> {
  return { templateId: content.meta.template, theme: content.meta.theme };
}
