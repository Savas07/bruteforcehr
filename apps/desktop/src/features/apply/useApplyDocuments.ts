/**
 * What both Apply panels (email composer and external-apply kit) share for one job: the session
 * draft (`session.ts`, kept when the panel closes), the CV version it attaches (the chosen
 * revision, a tailored one included), the merge-field values and the resolved texts, the PDFs
 * made for exactly this draft, and `uploadPins`, which stores the cover letter and the PDFs as
 * `renderedFiles` once per PDF set and returns what the application pins.
 */
import type { CvRevision, MergeValues } from "@bfhr/core";
import { useCallback, useContext, useEffect, useState } from "react";
import { useJobsRepository } from "../../data/jobs/repository";
import { displayTimeZone } from "../../data/tracker/live";
import { ModelEnvironmentContext } from "../../data/tracker/model";
import type { Lookup } from "../../data/tracker/repository";
import {
  type ApplyDraft,
  type ApplyInput,
  type ApplyPins,
  createDraft,
  jobCoverLetter,
  letterDay,
  letterTitle,
  mergeValues,
  type ResolvedDraft,
  resolveDraft,
} from "./model";
import { type AttachmentPdfs, makeAttachmentPdfs } from "./pdf";
import { designDraft, designSessionSuffix } from "./designState";
import { type ApplySession, applySessions } from "./session";
import { useCvRevision } from "./tailor/TailorHost";

export interface ApplyDocuments {
  readonly key: string;
  readonly session: ApplySession;
  readonly draft: ApplyDraft;
  /** Writes through to the session store, so toast actions after the panel closed still land. */
  readonly update: (change: (current: ApplySession) => ApplySession) => void;
  readonly edit: (patch: Partial<ApplyDraft>) => void;
  readonly ctx: { readonly now: Date; readonly timeZone: string };
  readonly revision: Lookup<CvRevision>;
  readonly values: MergeValues;
  readonly resolved: ResolvedDraft;
  /** The PDFs for exactly this draft (CV version, letter, subject, language, day); null until made. */
  readonly pdfs: AttachmentPdfs | null;
  readonly pdfsFailed: boolean;
  readonly retryPdfs: () => void;
  readonly pdfKey: string;
  readonly uploadPins: (files: AttachmentPdfs) => Promise<ApplyPins>;
}

export function useApplyDocuments(
  input: ApplyInput,
  options: {
    /** Whether the PDFs are wanted now (the composer: on Review; the kit: always). */
    readonly makePdfs: (session: ApplySession) => boolean;
  },
): ApplyDocuments {
  const repository = useJobsRepository();
  const environment = useContext(ModelEnvironmentContext);
  const { job } = input;
  const key = `${repository.uid}:${job.id}${__BFHR_DESIGN__ ? designSessionSuffix() : ""}`;
  const [session, setSession] = useState<ApplySession>(() => {
    const existing = applySessions.get(key);
    if (existing) return existing;
    const created: ApplySession = {
      // Design build: `?letter=ai` opens on an AI-drafted letter (designState.ts).
      draft: __BFHR_DESIGN__ ? designDraft(createDraft(input), input.renderedFiles) : createDraft(input),
      step: "compose",
      pdfs: null,
      pins: null,
      sendApplicationId: null,
      sendAt: null,
      recordedApplicationId: null,
    };
    applySessions.set(key, created);
    return created;
  });
  const update = useCallback(
    (change: (current: ApplySession) => ApplySession) => {
      const current = applySessions.get(key);
      if (!current) return;
      const next = change(current);
      applySessions.set(key, next);
      setSession(next);
    },
    [key],
  );
  const edit = useCallback(
    (patch: Partial<ApplyDraft>) => update((current) => ({ ...current, draft: { ...current.draft, ...patch } })),
    [update],
  );
  const { draft } = session;
  const wantPdfs = options.makePdfs(session);
  const ctx = { now: environment.now(), timeZone: environment.timeZone ?? displayTimeZone(input.profile) };
  const cv = input.cvs.find((candidate) => candidate.id === draft.cvId) ?? null;
  const revision = useCvRevision(cv?.id ?? null, draft.cvRevisionId ?? cv?.currentRevisionId ?? null);
  const content = revision.status === "ready" ? (revision.value?.content ?? null) : null;
  const values = mergeValues(input, content, draft, ctx);
  const resolved = resolveDraft(draft, values);
  const day = letterDay(ctx.now, ctx.timeZone);
  const revisionId = revision.status === "ready" ? (revision.value?.id ?? null) : null;
  const pdfKey = JSON.stringify([
    cv?.id,
    revisionId,
    draft.letterOn ? [resolved.letter, resolved.subject, draft.letterLanguage, day] : null,
  ]);
  const pdfs = session.pdfs?.key === pdfKey ? session.pdfs.files : null;
  /** The PDF set that failed to print (Try again clears it and prints again). */
  const [failedPdfKey, setFailedPdfKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!wantPdfs || content === null || cv === null || session.pdfs?.key === pdfKey) return;
    let cancelled = false;
    makeAttachmentPdfs({
      content,
      cvLanguage: cv.language,
      job,
      letter: draft.letterOn
        ? { body: resolved.letter, subject: resolved.subject, language: draft.letterLanguage, day }
        : null,
    }).then(
      (files) => {
        if (!cancelled) update((current) => ({ ...current, pdfs: { key: pdfKey, files } }));
      },
      (error: unknown) => {
        console.error("Couldn't make the application PDFs", error);
        if (!cancelled) setFailedPdfKey(pdfKey);
      },
    );
    return () => {
      cancelled = true;
    };
    // `pdfKey` covers the draft fields the PDFs depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantPdfs, pdfKey, content, attempt]);

  const uploadPins = async (files: AttachmentPdfs): Promise<ApplyPins> => {
    const cached = applySessions.get(key)?.pins;
    if (cached?.key === pdfKey) return cached.value;
    if (cv === null || revision.status !== "ready" || revision.value === null) throw new Error("CV revision not loaded");
    const cvRevisionId = revision.value.id;
    const coverLetterId =
      draft.letterOn && files.letter
        ? repository.saveCoverLetter(
            {
              jobId: job.id,
              applicationId: input.application?.id ?? null,
              title: letterTitle(job),
              language: draft.letterLanguage,
              body: resolved.letter,
              author: draft.letterAuthor,
            },
            jobCoverLetter(input.coverLetters, job.id),
          ).ids.coverLetterId
        : null;
    const cvFile = await repository.createRenderedFile({
      kind: "pdf",
      cvId: cv.id,
      cvRevisionId,
      coverLetterId: null,
      fileName: files.cv.fileName,
      bytes: files.cv.bytes,
    });
    const letterFile =
      files.letter && coverLetterId !== null
        ? await repository.createRenderedFile({
            kind: "pdf",
            cvId: null,
            cvRevisionId: null,
            coverLetterId,
            fileName: files.letter.fileName,
            bytes: files.letter.bytes,
          })
        : null;
    const pins: ApplyPins = { cvId: cv.id, cvRevisionId, cvFile, coverLetterId, letterFile };
    update((current) => ({ ...current, pins: { key: pdfKey, value: pins } }));
    return pins;
  };

  return {
    key,
    session,
    draft,
    update,
    edit,
    ctx,
    revision,
    values,
    resolved,
    pdfs,
    pdfsFailed: failedPdfKey === pdfKey && pdfs === null,
    retryPdfs: () => {
      setFailedPdfKey(null);
      setAttempt((count) => count + 1);
    },
    pdfKey,
    uploadPins,
  };
}
