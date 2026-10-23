/**
 * Editing sessions: how the CV editor turns edits into immutable revisions.
 *
 * Decision (M2): **one revision per editing session**, not per keystroke or pause. A session starts
 * with the first edit of a CV and ends when the user stops editing for `SESSION_IDLE_MS`, switches
 * to another CV or leaves the CVs area, the window is hidden, they press Mod+S, or the app is about
 * to restart. Its end commits one revision (backend.ts). Until then the working copy is kept on
 * this device (`localStorage`, debounced), so a crash or quit loses nothing: the next open picks it
 * up again. The header shows "Saved on this device" while a session is open and "Saved" once the
 * server has the revision.
 *
 * The draft keeps the item ids of the content it was built from (`base`), so every commit writes
 * `draftToContent(draft, baseDraft, base)` and the base moves only when the session is reset
 * (after "Use the other version", a restore, or a remote change while nothing is pending).
 *
 * Conflicts: a commit built on a stale `version` is rejected (backend.ts); a remote revision that
 * arrives while the session has unsaved edits is a conflict too. Both show the conflict banner:
 * Keep this version / Use the other version / Compare.
 *
 * The sessions live in a `CvSessionStore` (plain object, one per workspace); `useCvSession` reads
 * the selected CV's session through `useSyncExternalStore`.
 */
import type { CvContent, CvRevisionSource } from "@bfhr/core";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CvConflictError, type CvStudioBackend } from "./backend";
import { changedSections, draftToContent, sameContent } from "./content";
import type { CvDraft } from "./draft";
import type { CvEditorVM } from "./model";
import { trace } from "../../lib/e2eTrace";

/** Quiet time that ends an editing session. */
export const SESSION_IDLE_MS = 20_000;
/** How long typing pauses before the working copy is written to this device. */
const LOCAL_SAVE_MS = 500;

export type SessionStatus =
  /** Nothing to save. */
  | "idle"
  /** Edited, kept on this device; the session's revision is written when it ends. */
  | "editing"
  /** The revision is written locally and on its way to the server. */
  | "saving"
  | "saved"
  | "failed";

export interface CvConflict {
  /** The revision the CV points at now (the other device's). */
  readonly theirsRevisionId: string;
  /** Our content stored as an orphan revision, when the server rejected our write. */
  readonly orphanRevisionId: string | null;
  /** Our content at the time of the conflict. */
  readonly ours: CvContent;
}

export interface CvDesignChoice {
  readonly template: string;
  readonly fontPair: string;
}

/** What the view renders of one session. Replaced (never mutated) on every change. */
export interface CvSessionSnapshot {
  readonly cvId: string;
  readonly draft: CvDraft;
  readonly design: CvDesignChoice;
  readonly status: SessionStatus;
  readonly conflict: CvConflict | null;
  /** What a commit would write now (preview, export and checks render it). */
  readonly content: CvContent;
}

interface Session {
  readonly cvId: string;
  base: CvContent;
  baseDraft: CvDraft;
  /** Revision `base` is; the draft's item ids index into it. */
  baseRevisionId: string;
  draft: CvDraft;
  design: CvDesignChoice;
  dirty: boolean;
  /**
   * Revisions this session wrote, built on, or decided on in a conflict. An editor that still
   * points at one of them is behind the session, not a remote edit: right after a write, the store
   * is read with the last rendered editor until Firestore's snapshot of that write arrives.
   */
  readonly own: Set<string>;
  /** The revision our next commit builds on (the last one we wrote, else `baseRevisionId`). */
  headRevisionId: string;
  /** Version our last write set; snapshots may lag behind it. */
  version: number;
  status: SessionStatus;
  conflict: CvConflict | null;
  snapshot: CvSessionSnapshot;
  idleTimer: number;
  localTimer: number;
}

interface StoredDraft {
  readonly baseRevisionId: string;
  readonly draft: CvDraft;
  readonly design: CvDesignChoice;
}

const storageKey = (uid: string, cvId: string) => `bfhr.cv-session.${uid}.${cvId}`;

function readStored(uid: string, cvId: string): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(storageKey(uid, cvId));
    return raw ? (JSON.parse(raw) as StoredDraft) : null;
  } catch {
    return null;
  }
}

function contentOf(session: Session): CvContent {
  return draftToContent(session.draft, session.baseDraft, session.base, session.design);
}

export class CvSessionStore {
  private readonly sessions = new Map<string, Session>();
  private readonly listeners = new Set<() => void>();
  /** The editor view-model each CV was last seen with (revision contents and drafts). */
  private readonly editors = new Map<string, CvEditorVM>();

  constructor(
    private readonly backend: CvStudioBackend,
    /** `diffSummary` of a session commit: the changed sections' names in the UI language. */
    private describe: (sections: readonly string[]) => string,
  ) {}

  setDescribe(describe: (sections: readonly string[]) => string): void {
    this.describe = describe;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Brings the CV's session up to date with the latest snapshot and returns what to render.
   * Idempotent: the same `editor` gives the same snapshot (safe to call during render).
   */
  view(editor: CvEditorVM): CvSessionSnapshot {
    this.editors.set(editor.cvId, editor);
    let session = this.sessions.get(editor.cvId);
    if (!session) {
      session = this.open(editor);
      this.sessions.set(editor.cvId, session);
    }
    const remote =
      editor.currentRevisionId !== session.headRevisionId &&
      !session.own.has(editor.currentRevisionId) &&
      session.conflict?.theirsRevisionId !== editor.currentRevisionId;
    if (remote) {
      trace("SESSION remote", {
        editorCurrent: editor.currentRevisionId,
        editorVersion: editor.version,
        head: session.headRevisionId,
        own: [...session.own],
        dirty: session.dirty,
        status: session.status,
        conflictTheirs: session.conflict?.theirsRevisionId ?? null,
        hasContent: Boolean(editor.revisionContents[editor.currentRevisionId]),
        draftSummary: session.draft.summary,
      });
      if (session.dirty || session.status === "saving") {
        session.conflict = {
          theirsRevisionId: editor.currentRevisionId,
          orphanRevisionId: session.conflict?.orphanRevisionId ?? null,
          ours: contentOf(session),
        };
        trace("SESSION conflict(view)", { theirs: editor.currentRevisionId, oursSummary: session.conflict.ours.basics?.summary ?? null });
        this.refresh(session, false);
      } else if (editor.revisionContents[editor.currentRevisionId]) {
        trace("SESSION fresh(view)", editor.currentRevisionId);
        session = this.fresh(editor, editor.currentRevisionId);
        this.sessions.set(editor.cvId, session);
      }
    }
    if (editor.version > session.version) session.version = editor.version;
    return session.snapshot;
  }

  edit(cvId: string, update: (current: CvDraft) => CvDraft): void {
    const session = this.sessions.get(cvId);
    if (!session) return;
    session.draft = update(session.draft);
    trace("SESSION edit", { summary: session.draft.summary, status: session.status });
    this.touched(session);
  }

  setDesign(cvId: string, patch: Partial<CvDesignChoice>): void {
    const session = this.sessions.get(cvId);
    if (!session) return;
    session.design = { ...session.design, ...patch };
    this.touched(session);
  }

  /** Ends a session: writes its revision (no-op when nothing changed or it is in conflict). */
  commit(cvId: string): void {
    const session = this.sessions.get(cvId);
    if (!session) return;
    window.clearTimeout(session.idleTimer);
    trace("SESSION commit", { dirty: session.dirty, conflict: session.conflict?.theirsRevisionId ?? null });
    if (!session.dirty || session.conflict) return;
    const content = contentOf(session);
    const previous = this.editors.get(cvId)?.revisionContents[session.headRevisionId];
    session.dirty = false;
    this.forget(session);
    if (previous && sameContent(previous, content)) {
      session.status = "saved";
      this.refresh(session);
      return;
    }
    const sections = previous ? changedSections(previous, content) : [];
    this.write(session, content, "manual", session.headRevisionId, sections.length > 0 ? this.describe(sections) : null);
  }

  /** Ends every open session (leaving the area, hiding the window). */
  commitAll(except?: string): void {
    for (const cvId of this.sessions.keys()) if (cvId !== except) this.commit(cvId);
  }

  /** History "Restore": ends the session, then writes `revisionId`'s content as a new revision. */
  restore(cvId: string, revisionId: string, diffSummary: string): void {
    const session = this.sessions.get(cvId);
    const editor = this.editors.get(cvId);
    const content = editor?.revisionContents[revisionId];
    const restoredDraft = editor?.revisionDrafts[revisionId];
    if (!session || !content || !restoredDraft) return;
    this.commit(cvId);
    this.write(session, content, "manual", revisionId, diffSummary);
    // The working copy is now the restored content: rebase on it.
    session.base = content;
    session.baseDraft = restoredDraft;
    session.draft = restoredDraft;
    session.design = { template: content.meta.template, fontPair: content.meta.theme.fontPair };
    session.baseRevisionId = revisionId;
    this.refresh(session);
  }

  /** Keep this version: our content becomes the CV's current revision, on top of theirs. */
  keepMine(cvId: string): void {
    const session = this.sessions.get(cvId);
    const editor = this.editors.get(cvId);
    const conflict = session?.conflict;
    if (!session || !editor || !conflict) return;
    session.conflict = null;
    // Theirs is decided on: until our write's snapshot arrives, the CV still points at it.
    session.own.add(conflict.theirsRevisionId);
    session.dirty = false;
    session.version = editor.version;
    this.forget(session);
    if (conflict.orphanRevisionId === null) {
      this.write(session, conflict.ours, "manual", editor.currentRevisionId, null);
      return;
    }
    const orphan = conflict.orphanRevisionId;
    const { done } = this.backend.adoptRevision({ id: cvId, version: editor.version }, orphan, conflict.ours);
    this.advance(session, orphan);
    this.refresh(session);
    done.then(
      () => {
        if (session.headRevisionId === orphan && !session.dirty) session.status = "saved";
        this.refresh(session);
      },
      (error: unknown) => this.failed(session, error, conflict.ours),
    );
  }

  /** Use the other version: drops our working copy and continues from theirs. */
  useTheirs(cvId: string): void {
    const session = this.sessions.get(cvId);
    const editor = this.editors.get(cvId);
    if (!session || !editor) return;
    this.forget(session);
    window.clearTimeout(session.idleTimer);
    this.sessions.set(cvId, this.fresh(editor, editor.currentRevisionId));
    this.emit();
  }

  /** The content a commit of this session would write now. */
  content(cvId: string): CvContent | null {
    const session = this.sessions.get(cvId);
    return session ? contentOf(session) : null;
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      window.clearTimeout(session.localTimer);
    }
    this.commitAll();
    for (const session of this.sessions.values()) window.clearTimeout(session.idleTimer);
  }

  /* -------------------------------------------------------------------------------------------- */

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private refresh(session: Session, notify = true): void {
    session.snapshot = {
      cvId: session.cvId,
      draft: session.draft,
      design: session.design,
      status: session.status,
      conflict: session.conflict,
      content: contentOf(session),
    };
    if (notify) this.emit();
  }

  private fresh(editor: CvEditorVM, revisionId: string): Session {
    const base = editor.revisionContents[revisionId];
    const baseDraft = editor.revisionDrafts[revisionId] ?? editor.draft;
    const fallback: CvContent = {
      meta: {
        template: editor.design.templateId,
        theme: {
          accentColor: editor.draft.accentColor,
          fontPair: editor.design.fontPair,
          density: editor.draft.density,
          paperSize: editor.draft.paperSize,
        },
        sectionOrder: [],
        customSections: [],
      },
    };
    const content = base ?? fallback;
    const session: Session = {
      cvId: editor.cvId,
      base: content,
      baseDraft,
      baseRevisionId: revisionId,
      draft: baseDraft,
      design: { template: content.meta.template, fontPair: content.meta.theme.fontPair },
      dirty: false,
      own: new Set(),
      headRevisionId: revisionId,
      version: editor.version,
      status: "idle",
      conflict: null,
      snapshot: null as unknown as CvSessionSnapshot,
      idleTimer: 0,
      localTimer: 0,
    };
    this.refresh(session, false);
    return session;
  }

  /** A new session, picking up a working copy this device kept (crash, quit). */
  private open(editor: CvEditorVM): Session {
    const stored = readStored(this.backend.uid, editor.cvId);
    if (!stored || !editor.revisionContents[stored.baseRevisionId]) return this.fresh(editor, editor.currentRevisionId);
    const session = this.fresh(editor, stored.baseRevisionId);
    session.draft = stored.draft;
    session.design = stored.design;
    session.dirty = true;
    session.status = "editing";
    session.headRevisionId = editor.currentRevisionId;
    if (stored.baseRevisionId !== editor.currentRevisionId) {
      // Someone saved this CV after our working copy was kept: let the user choose.
      session.conflict = { theirsRevisionId: editor.currentRevisionId, orphanRevisionId: null, ours: contentOf(session) };
    }
    this.refresh(session, false);
    return session;
  }

  private touched(session: Session): void {
    session.dirty = true;
    if (session.status !== "saving") session.status = "editing";
    this.refresh(session);
    window.clearTimeout(session.localTimer);
    session.localTimer = window.setTimeout(() => {
      try {
        const stored: StoredDraft = { baseRevisionId: session.baseRevisionId, draft: session.draft, design: session.design };
        window.localStorage.setItem(storageKey(this.backend.uid, session.cvId), JSON.stringify(stored));
      } catch (error) {
        console.error("Couldn't keep the CV draft on this device", error);
      }
    }, LOCAL_SAVE_MS);
    window.clearTimeout(session.idleTimer);
    session.idleTimer = window.setTimeout(() => this.commit(session.cvId), SESSION_IDLE_MS);
  }

  private forget(session: Session): void {
    window.clearTimeout(session.localTimer);
    window.localStorage.removeItem(storageKey(this.backend.uid, session.cvId));
  }

  /** Moves the session onto a revision it wrote or adopted; the revision it leaves stays its own. */
  private advance(session: Session, revisionId: string): void {
    session.own.add(session.headRevisionId);
    session.own.add(revisionId);
    session.headRevisionId = revisionId;
    session.version += 1;
    session.status = "saving";
  }

  private write(session: Session, content: CvContent, source: CvRevisionSource, basedOn: string, diffSummary: string | null): void {
    const { ids, done } = this.backend.commitRevision({
      cv: { id: session.cvId, version: session.version },
      content,
      basedOnRevisionId: basedOn,
      source,
      diffSummary,
    });
    trace("SESSION write", { id: ids.revisionId, version: session.version, basedOn, previousHead: session.headRevisionId, summary: content.basics?.summary ?? null });
    this.advance(session, ids.revisionId);
    this.refresh(session);
    trace("SESSION write emitted", { id: ids.revisionId, conflict: session.conflict?.theirsRevisionId ?? null });
    done.then(
      () => {
        trace("SESSION write done", ids.revisionId);
        if (session.headRevisionId === ids.revisionId && !session.dirty) session.status = "saved";
        this.refresh(session);
      },
      (error: unknown) => {
        trace("SESSION write failed", ids.revisionId, String(error), error instanceof Error && "code" in error ? String(error.code) : null);
        session.own.delete(ids.revisionId);
        this.failed(session, error, content);
      },
    );
  }

  private failed(session: Session, error: unknown, ours: CvContent): void {
    if (error instanceof CvConflictError) {
      const editor = this.editors.get(session.cvId);
      session.conflict = {
        theirsRevisionId: session.conflict?.theirsRevisionId ?? editor?.currentRevisionId ?? session.baseRevisionId,
        orphanRevisionId: error.orphanRevisionId,
        ours,
      };
      session.status = "editing";
    } else {
      console.error("Couldn't save the CV", error);
      session.status = "failed";
    }
    session.dirty = true;
    this.refresh(session);
  }
}

export interface CvSession extends CvSessionSnapshot {
  readonly store: CvSessionStore;
}

/**
 * The selected CV's session. The store lives as long as the workspace: sessions of other CVs are
 * committed when the user switches away, all of them when the window hides or the workspace unmounts.
 */
export function useCvSession(
  backend: CvStudioBackend,
  editor: CvEditorVM,
  describe: (sections: readonly string[]) => string,
): CvSession {
  const [store] = useState(() => new CvSessionStore(backend, describe));
  useEffect(() => store.setDescribe(describe), [store, describe]);
  const snapshot = useSyncExternalStore(store.subscribe, () => store.view(editor));

  useEffect(() => store.commitAll(editor.cvId), [store, editor.cvId]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") store.commitAll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      store.dispose();
    };
  }, [store]);

  return { ...snapshot, store };
}
