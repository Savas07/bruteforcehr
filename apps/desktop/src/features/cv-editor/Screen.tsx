/**
 * CVs (`/cvs`, `/cvs/$cvId`): CV list | structured editor | live preview | inspector (IA.md CVs
 * row, research/cv-editor.md "Decision — Desktop"). The list collapses to icons below 1280 px,
 * the preview becomes a toggle below 1100 px (Mod+Shift+P), and the inspector (Mod+Shift+D)
 * docks beside the preview only when all panes fit, otherwise it floats over it.
 *
 * M0 has no backend: edits live in local state, every reversible action shows an Undo toast,
 * and pending AI suggestions come from `design-suggestions.ts` (design build only).
 */
import { useNavigate } from "@tanstack/react-router";
import { Eye, FileUp, History, PanelRight, PenLine, Sparkles } from "lucide-react";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { defineMessage, defineMessages, useIntl } from "react-intl";
import { destinationMessages } from "../../lib/destinations";
import { useConnectivity } from "../../shared/connectivity";
import { cx } from "../../shared/cx";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import type { ScreenProps } from "../../shared/screen";
import { Button, IconButton } from "../../shared/ui/Button";
import { useBreakpoints } from "../../shared/ui/layout";
import { PaneError } from "../../shared/ui/PaneError";
import { ScreenTitle } from "../../shared/ui/ScreenTitle";
import { CvFormSkeleton, CvPreviewSkeleton, SkeletonBlock, SkeletonRegion } from "../../shared/ui/Skeleton";
import { StaleStamp } from "../../shared/ui/StaleStamp";
import { SyncStatus, type SaveState } from "../../shared/ui/SyncStatus";
import { useToast } from "../../shared/ui/Toast";
import { useUnsavedChanges } from "../../shared/unsavedChanges";
import { keywordCoverage } from "./coverage";
import { CvListPane } from "./CvListPane";
import { CvSuggestionSeedContext } from "./suggestionSeed";
import {
  addSkillKeyword,
  emptyItem,
  insertBullet,
  insertItem,
  moveItem,
  moveSection,
  removeItem,
  removeSkillKeyword,
  setTextAt,
  type CvDraft,
} from "./draft";
import { EditorPane, type EditorOps } from "./EditorPane";
import { Inspector, type InspectorTab } from "./Inspector";
import type { CvEditorModel, CvEditorVM, CvFirstUseVM, CvRevisionVM } from "./model";
import { useCvBackend, type CvMetadataPatch } from "./backend";
import { CompareDialog, ConflictBanner, conflictMessages } from "./Compare";
import { useCvSession } from "./session";
import { useCvCreation, type CvCreation } from "./useCvCreation";
import type { TimeVM } from "../../shared/model/types";
import { PreviewPane } from "./PreviewPane";
import type { CvPreviewBlock } from "./preview-document";
import { buildSuggestionVMs, fillPlaceholders, hasUnfilledPlaceholders, type CvSuggestionInput } from "./suggestions";
import { useWindowQuery } from "./useWindowWidth";

/** Names this CV in "Save your changes before restarting?" (also used by src/design/updates.tsx). */
export const unsavedLabelMessage = defineMessage({
  id: "cv-editor.view.unsavedLabel",
  defaultMessage: "CV “{title}”",
  description: "Names this CV in “Save your changes before restarting?”",
});

const messages = defineMessages({
  loading: { id: "cv-editor.loading", defaultMessage: "Loading your CVs" },
  errorTitle: { id: "cv-editor.error.title", defaultMessage: "We couldn't load your CVs" },
  errorBody: {
    id: "cv-editor.error.body",
    defaultMessage: "Our server didn't respond. Your saved CVs are safe. Try again in a moment.",
  },
  undo: { id: "cv-editor.toast.undo", defaultMessage: "Undo" },
  removed: { id: "cv-editor.toast.removed", defaultMessage: "Removed {name}" },
  applied: { id: "cv-editor.toast.applied", defaultMessage: "Suggestion applied" },
  kept: { id: "cv-editor.toast.kept", defaultMessage: "Kept your original" },
  keptAll: {
    id: "cv-editor.toast.keptAll",
    defaultMessage: "Kept your original for {count, plural, one {# suggestion} other {# suggestions}}",
  },
  archived: { id: "cv-editor.toast.archived", defaultMessage: "Archived {title}" },
  unarchived: { id: "cv-editor.toast.unarchived", defaultMessage: "{title} is back in your CVs" },
  renamed: { id: "cv-editor.toast.renamed", defaultMessage: "Renamed to {title}" },
  restored: { id: "cv-editor.toast.restored", defaultMessage: "Restored the version from {date}" },
  skillAdded: { id: "cv-editor.toast.skillAdded", defaultMessage: "Added {keyword} to Skills" },
  excluded: { id: "cv-editor.toast.excluded", defaultMessage: "Left {keyword} out of the check" },
  moved: {
    id: "cv-editor.move.moved",
    defaultMessage: "Moved {name} to position {position, number} of {total, number}",
  },
  cantMove: { id: "cv-editor.move.cantMove", defaultMessage: "{name} can't move further" },
  moveUp: { id: "cv-editor.keys.moveUp", defaultMessage: "Move entry or section up" },
  moveDown: { id: "cv-editor.keys.moveDown", defaultMessage: "Move entry or section down" },
  useOrAdd: { id: "cv-editor.keys.useOrAdd", defaultMessage: "Use focused suggestion, or add a line below" },
  keep: { id: "cv-editor.keys.keep", defaultMessage: "Keep original (focused suggestion)" },
  nextSuggestion: { id: "cv-editor.keys.nextSuggestion", defaultMessage: "Next suggestion" },
  previousSuggestion: { id: "cv-editor.keys.previousSuggestion", defaultMessage: "Previous suggestion" },
  toggleInspector: { id: "cv-editor.keys.toggleInspector", defaultMessage: "Show or hide inspector" },
  togglePreview: { id: "cv-editor.keys.togglePreview", defaultMessage: "Show or hide preview" },
  showInspector: { id: "cv-editor.toolbar.inspector", defaultMessage: "Inspector" },
  showPreview: { id: "cv-editor.toolbar.preview", defaultMessage: "Preview" },
  showEditor: { id: "cv-editor.toolbar.editor", defaultMessage: "Back to editing" },
  history: { id: "cv-editor.toolbar.history", defaultMessage: "Version history" },
  pendingButton: {
    id: "cv-editor.toolbar.pending",
    defaultMessage: "{count, plural, one {# suggestion} other {# suggestions}}",
    description: "Toolbar button that opens the Suggestions tab",
  },
  pendingHint: { id: "cv-editor.toolbar.pendingHint", defaultMessage: "Review suggestions" },
  keysGroup: { id: "cv-editor.keys.group", defaultMessage: "CV editor" },
  openBase: { id: "cv-editor.variant.openBase", defaultMessage: "Open base CV" },
  archivedNote: { id: "cv-editor.archivedNote", defaultMessage: "Archived {time}" },
  editedSections: {
    id: "cv-editor.revision.edited",
    defaultMessage: "Edited {sections}",
    description: "Version history sentence of a saved editing session; {sections}: 'Summary and Experience'",
  },
  updateFailed: {
    id: "cv-editor.toast.updateFailed",
    defaultMessage: "That change didn't save. Your CV is as it was; try again in a moment.",
  },
  compareConflictTitle: { id: "cv-editor.compare.conflictTitle", defaultMessage: "Compare the two versions" },
  compareConflictBody: {
    id: "cv-editor.compare.conflictBody",
    defaultMessage: "From the other device's version to yours. Whichever you choose, the other stays in Version history.",
  },
  compareRevisionTitle: { id: "cv-editor.compare.revisionTitle", defaultMessage: "Compare with now" },
  compareRevisionBody: {
    id: "cv-editor.compare.revisionBody",
    defaultMessage: "From the version of {date} to your CV as it is now.",
  },
  save: { id: "cv-editor.keys.save", defaultMessage: "Save now" },
});
type Fills = Readonly<Record<string, Readonly<Record<string, string>>>>;

function LoadingLayout({ iconsOnly }: { iconsOnly: boolean }) {
  const intl = useIntl();
  return (
    <SkeletonRegion
      loading
      label={intl.formatMessage(messages.loading)}
      className="flex min-h-0 flex-1"
      skeleton={
        <div className="flex min-h-0 flex-1">
          <div className={cx("border-line-subtle flex shrink-0 flex-col gap-3 border-r p-3", iconsOnly ? "w-16" : "w-66")}>
            {[0, 1, 2].map((row) => (
              <div key={row} className={cx("flex flex-col gap-1.5", row > 0 && !iconsOnly && "ml-4")}>
                <SkeletonBlock className={iconsOnly ? "size-10 rounded-md" : "h-4 w-40"} />
                {!iconsOnly && <SkeletonBlock className="h-3 w-28" />}
              </div>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <CvFormSkeleton />
          </div>
          <div className="bg-surface-sunken hidden min-w-0 flex-1 p-6 min-[1100px]:block">
            <CvPreviewSkeleton />
          </div>
        </div>
      }
    >
      {null}
    </SkeletonRegion>
  );
}

function FirstUse({ firstUse, creation }: { firstUse: CvFirstUseVM; creation: CvCreation }) {
  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-8 py-16">
      <div className="flex w-full max-w-160 flex-col gap-6">
        <div>
          <h2 className="text-title2">{firstUse.title}</h2>
          <p className="text-fg-secondary mt-2 text-body">{firstUse.body}</p>
        </div>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {firstUse.choices.map((choice) => {
            const Icon = choice.id === "import" ? FileUp : PenLine;
            return (
              <li key={choice.id}>
                <button
                  type="button"
                  onClick={choice.id === "import" ? creation.openImport : creation.openNew}
                  className={cx(
                    "hover:bg-surface-hover flex h-full w-full flex-col items-start gap-2 rounded-lg border p-4 text-left",
                    choice.primary ? "border-accent-solid" : "border-line-control",
                  )}
                >
                  <Icon aria-hidden className={cx("size-6", choice.primary ? "text-accent-text" : "text-fg-secondary")} />
                  <span className="text-headline">{choice.label}</span>
                  <span className="text-fg-secondary text-callout">{choice.description}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** `record` without `key` (records are immutable state here). */
function without<Value>(record: Readonly<Record<string, Value>>, key: string): Record<string, Value> {
  return Object.fromEntries(Object.entries(record).filter(([candidate]) => candidate !== key));
}

function Workspace({
  model,
  editor,
  fromCache,
  updatedAt,
  updatedClock,
}: {
  model: CvEditorModel;
  editor: CvEditorVM;
  fromCache: boolean;
  updatedAt: TimeVM;
  updatedClock: string;
}) {
  const intl = useIntl();
  const toast = useToast();
  const navigate = useNavigate();
  const { status } = useConnectivity();
  const offline = status === "offline";
  const breakpoints = useBreakpoints();
  const iconsOnly = useWindowQuery("listIcons");
  const docked = useWindowQuery("inspectorDocked");
  const cvId = editor.cvId;

  const backend = useCvBackend();
  const sectionTitles = useMemo(
    (): Readonly<Record<string, string>> => ({
      ...Object.fromEntries(editor.sections.map((section) => [section.key, section.title])),
      basics: editor.sections.find((section) => section.key === "header")?.title ?? "",
    }),
    [editor.sections],
  );
  const describe = useCallback(
    (keys: readonly string[]) =>
      intl.formatMessage(messages.editedSections, {
        sections: intl.formatList(
          keys.map((key) => sectionTitles[key] ?? key),
          { type: "conjunction" },
        ),
      }),
    [intl, sectionTitles],
  );
  const session = useCvSession(backend, editor, describe);
  const { store } = session;
  const draft = session.draft;
  const change = (update: (current: CvDraft) => CvDraft) => store.edit(cvId, update);
  const commit = () => store.commit(cvId);

  const [compare, setCompare] = useState<{ readonly kind: "conflict" } | { readonly kind: "revision"; readonly revision: CvRevisionVM } | null>(
    null,
  );
  const seed = useContext(CvSuggestionSeedContext);
  // Suggestions `cvAssist` returned in this window (they are proposals, never stored).
  const [requested, setRequested] = useState<readonly CvSuggestionInput[]>([]);
  const [assistBusy, setAssistBusy] = useState<ReadonlySet<string>>(new Set());
  const suggestions = useMemo(
    () => buildSuggestionVMs([...seed, ...requested], draft, sectionTitles, intl),
    [seed, requested, draft, sectionTitles, intl],
  );
  const [decided, setDecided] = useState<Readonly<Record<string, true>>>({});
  const [fills, setFills] = useState<Fills>({});
  const pending = suggestions.filter((suggestion) => !decided[suggestion.id]);

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set(["header"]));
  // Items start collapsed: their cards show title, dates, first line and a suggestion badge.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(docked);
  const [tab, setTab] = useState<InspectorTab>(pending.length > 0 ? "suggestions" : "design");
  const [previewShown, setPreviewShown] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const saveState: SaveState | null =
    session.status === "editing"
      ? "local"
      : session.status === "saving"
        ? offline || editor.pendingSync
          ? "local"
          : "saving"
        : session.status === "failed"
          ? "failed"
          : null;
  const [jobId, setJobId] = useState(editor.check.defaultJobId);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());

  // Focus requests land after the next render (expanded sections and items exist by then).
  const focusRequest = useRef<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const selector = focusRequest.current;
    if (!selector) return;
    focusRequest.current = null;
    const target = editorRef.current?.querySelector<HTMLElement>(selector);
    target?.scrollIntoView({ block: "center" });
    target?.focus({ preventScroll: true });
  });

  const edited = change;
  // While a session is open, "Restart to update" asks first (src/shared/unsavedChanges.ts);
  // saving ends the session now.
  useUnsavedChanges(
    session.status === "editing"
      ? {
          label: intl.formatMessage(unsavedLabelMessage, { title: editor.title }),
          save: () => {
            commit();
            return Promise.resolve();
          },
        }
      : null,
  );

  const undo = (run: () => void) => ({ label: intl.formatMessage(messages.undo), run });
  const sectionName = (key: string) => sectionTitles[key] ?? key;
  const itemName = (sectionKey: string, itemId: string) => {
    const item = draft.sections.find((section) => section.key === sectionKey)?.items.find((entry) => entry.id === itemId);
    return item?.title.trim() || item?.org || editor.itemFields[sectionKey]?.untitled || sectionName(sectionKey);
  };

  const nextId = useRef(0);
  const ops: EditorOps = {
    change: edited,
    moveSection: (key, delta) => {
      const moved = moveSection(draft, key, delta);
      if (!moved) {
        setAnnouncement(intl.formatMessage(messages.cantMove, { name: sectionName(key) }));
        return;
      }
      edited(() => moved);
      const position = moved.sections.findIndex((section) => section.key === key);
      setAnnouncement(
        intl.formatMessage(messages.moved, { name: sectionName(key), position: position + 1, total: moved.sections.length }),
      );
      focusRequest.current = `[data-section-key="${key}"] h2 button`;
    },
    moveItem: (sectionKey, itemId, delta) => {
      const moved = moveItem(draft, sectionKey, itemId, delta);
      const name = itemName(sectionKey, itemId);
      if (!moved) {
        setAnnouncement(intl.formatMessage(messages.cantMove, { name }));
        return;
      }
      edited(() => moved);
      const items = moved.sections.find((section) => section.key === sectionKey)?.items ?? [];
      setAnnouncement(
        intl.formatMessage(messages.moved, {
          name,
          position: items.findIndex((item) => item.id === itemId) + 1,
          total: items.length,
        }),
      );
      focusRequest.current = `[data-item-id="${itemId}"] button[aria-expanded]`;
    },
    addItem: (sectionKey) => {
      nextId.current += 1;
      const id = `${sectionKey}-new-${nextId.current}`;
      edited((current) => insertItem(current, sectionKey, emptyItem(id)));
      setExpanded((previous) => new Set(previous).add(id));
      focusRequest.current = `[data-item-id="${id}"] input`;
    },
    removeItem: (sectionKey, itemId) => {
      const result = removeItem(draft, sectionKey, itemId);
      if (!result) return;
      const name = itemName(sectionKey, itemId);
      edited(() => result.draft);
      toast.show({
        message: intl.formatMessage(messages.removed, { name }),
        action: undo(() => change((current) => insertItem(current, sectionKey, result.item, result.index))),
      });
    },
    toggleSection: (key) =>
      setCollapsed((previous) => {
        const next = new Set(previous);
        if (!next.delete(key)) next.add(key);
        return next;
      }),
    toggleItem: (itemId) =>
      setExpanded((previous) => {
        const next = new Set(previous);
        if (!next.delete(itemId)) next.add(itemId);
        return next;
      }),
    focusBlock: setHighlightId,
    useSuggestion: (id, then) => {
      const suggestion = suggestions.find((candidate) => candidate.id === id);
      if (!suggestion || hasUnfilledPlaceholders(suggestion.placeholders, fills[id] ?? {})) return;
      edited((current) => setTextAt(current, suggestion.target, fillPlaceholders(suggestion.proposed, fills[id] ?? {})));
      setDecided((previous) => ({ ...previous, [id]: true }));
      const { itemId, bulletIndex } = suggestion.target;
      focusRequest.current =
        then === "edit" && itemId !== null
          ? `[data-bullet="${itemId}:${bulletIndex ?? 0}"]`
          : itemId === null
            ? `[data-section-key="summary"] textarea`
            : `[data-item-id="${itemId}"] [data-bullet="${itemId}:${bulletIndex ?? 0}"]`;
      toast.show({
        message: intl.formatMessage(messages.applied),
        action: undo(() => {
          change((current) => setTextAt(current, suggestion.target, suggestion.original));
          setDecided((previous) => without(previous, id));
        }),
      });
    },
    keepSuggestion: (id) => {
      setDecided((previous) => ({ ...previous, [id]: true }));
      toast.show({
        message: intl.formatMessage(messages.kept),
        action: undo(() =>
          setDecided((previous) => without(previous, id)),
        ),
      });
    },
    fillSuggestion: (id, placeholder, value) =>
      setFills((previous) => ({ ...previous, [id]: { ...previous[id], [placeholder]: value } })),
  };

  const keepAll = () => {
    const ids = pending.map((suggestion) => suggestion.id);
    setDecided((previous) => ({ ...previous, ...Object.fromEntries(ids.map((id) => [id, true as const])) }));
    toast.show({
      message: intl.formatMessage(messages.keptAll, { count: ids.length }),
      extended: true,
      action: undo(() =>
        setDecided((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => !ids.includes(id)))),
      ),
    });
  };

  const showSuggestion = (id: string) => {
    const suggestion = suggestions.find((candidate) => candidate.id === id);
    if (!suggestion) return;
    const { sectionKey, itemId } = suggestion.target;
    setCollapsed((previous) => {
      const next = new Set(previous);
      next.delete(sectionKey);
      return next;
    });
    if (itemId) setExpanded((previous) => new Set(previous).add(itemId));
    setPreviewShown(false);
    focusRequest.current = `[data-suggestion-id="${id}"]`;
  };

  const locate = (block: CvPreviewBlock) => {
    const sectionKey = block.kind === "header" ? "header" : block.sectionKey;
    setCollapsed((previous) => {
      const next = new Set(previous);
      next.delete(sectionKey);
      return next;
    });
    setPreviewShown(false);
    setHighlightId(block.id);
    if (block.kind === "entry" || block.kind === "line") {
      setExpanded((previous) => new Set(previous).add(block.id));
      focusRequest.current = `[data-item-id="${block.id}"] input, [data-item-id="${block.id}"] textarea`;
    } else {
      focusRequest.current = `[data-section-key="${sectionKey}"] input, [data-section-key="${sectionKey}"] textarea`;
    }
  };

  const focusedWithin = (selector: string) =>
    (document.activeElement?.closest(selector) as HTMLElement | null) ?? null;
  const moveFocused = (delta: -1 | 1) => {
    const item = focusedWithin("[data-item-id]");
    if (item?.dataset.itemId && item.dataset.sectionKey) {
      ops.moveItem(item.dataset.sectionKey, item.dataset.itemId, delta);
      return;
    }
    const section = focusedWithin("[data-section-key]");
    if (section?.dataset.sectionKey && section.dataset.sectionKey !== "header") {
      ops.moveSection(section.dataset.sectionKey, delta);
    }
  };
  const stepSuggestion = (delta: 1 | -1) => {
    if (pending.length === 0) return;
    const order = pending.map((suggestion) => suggestion.id);
    const current = focusedWithin("[data-suggestion-id]")?.dataset.suggestionId;
    const index = current ? order.indexOf(current) : delta === 1 ? -1 : 0;
    const next = order[(index + delta + order.length) % order.length];
    if (next) showSuggestion(next);
  };
  const keysGroup = intl.formatMessage(messages.keysGroup);
  const inEditor = () => editorRef.current?.contains(document.activeElement) ?? false;
  useKeyBindings([
    {
      id: "cv-editor.move.up",
      keys: "Alt+ArrowUp",
      label: intl.formatMessage(messages.moveUp),
      group: keysGroup,
      when: () => inEditor() && focusedWithin("[data-section-key]") !== null,
      run: () => moveFocused(-1),
    },
    {
      id: "cv-editor.move.down",
      keys: "Alt+ArrowDown",
      label: intl.formatMessage(messages.moveDown),
      group: keysGroup,
      when: () => inEditor() && focusedWithin("[data-section-key]") !== null,
      run: () => moveFocused(1),
    },
    {
      id: "cv-editor.suggestion.use",
      keys: "Mod+Enter",
      label: intl.formatMessage(messages.useOrAdd),
      group: keysGroup,
      when: () => focusedWithin("[data-suggestion-id]") !== null || focusedWithin("[data-bullet]") !== null,
      run: () => {
        const suggestionId = focusedWithin("[data-suggestion-id]")?.dataset.suggestionId;
        if (suggestionId) {
          ops.useSuggestion(suggestionId, "done");
          return;
        }
        const [itemId, index] = (focusedWithin("[data-bullet]")?.dataset.bullet ?? "").split(":");
        const sectionKey = focusedWithin("[data-item-id]")?.dataset.sectionKey;
        if (!itemId || !sectionKey) return;
        const at = Number(index);
        edited((current) => insertBullet(current, sectionKey, itemId, at));
        focusRequest.current = `[data-bullet="${itemId}:${at + 1}"]`;
      },
    },
    {
      id: "cv-editor.suggestion.keep",
      keys: "Escape",
      label: intl.formatMessage(messages.keep),
      group: keysGroup,
      inTextFields: true,
      when: () => focusedWithin("[data-suggestion-id]") !== null,
      run: () => {
        const suggestionId = focusedWithin("[data-suggestion-id]")?.dataset.suggestionId;
        if (suggestionId) ops.keepSuggestion(suggestionId);
      },
    },
    {
      id: "cv-editor.suggestion.next",
      keys: "F8",
      label: intl.formatMessage(messages.nextSuggestion),
      group: keysGroup,
      enabled: pending.length > 0,
      inTextFields: true,
      run: () => stepSuggestion(1),
    },
    {
      id: "cv-editor.suggestion.previous",
      keys: "Shift+F8",
      label: intl.formatMessage(messages.previousSuggestion),
      group: keysGroup,
      enabled: pending.length > 0,
      inTextFields: true,
      run: () => stepSuggestion(-1),
    },
    {
      id: "cv-editor.save",
      keys: "Mod+S",
      label: intl.formatMessage(messages.save),
      group: keysGroup,
      inTextFields: true,
      run: commit,
    },
    {
      id: "cv-editor.inspector.toggle",
      keys: "Mod+Shift+D",
      label: intl.formatMessage(messages.toggleInspector),
      group: keysGroup,
      run: () => setInspectorOpen((open) => !open),
    },
    {
      id: "cv-editor.preview.toggle",
      keys: "Mod+Shift+P",
      label: intl.formatMessage(messages.togglePreview),
      group: keysGroup,
      enabled: breakpoints.previewToggle,
      run: () => setPreviewShown((shown) => !shown),
    },
  ]);

  const select = (id: string) => void navigate({ to: "/cvs/$cvId", params: { cvId: id }, search: true });
  const openHistory = (id: string) => {
    if (id !== cvId) select(id);
    setTab("history");
    setInspectorOpen(true);
  };
  const titleOf = (id: string) => model.records[id]?.title ?? id;
  // Rename and archive write on the latest version this device knows (`version + 1`, like saves).
  const writeMetadata = (id: string, patch: CvMetadataPatch) => {
    const record = model.records[id];
    if (!record) return;
    backend.updateCv({ id, version: record.version }, patch).done.catch((error: unknown) => {
      console.error("Couldn't update the CV", error);
      toast.show({ variant: "info", message: intl.formatMessage(messages.updateFailed) });
    });
  };
  const creation = useCvCreation(model);

  const job = editor.check.jobs.find((candidate) => candidate.jobId === jobId) ?? null;
  const coverage = job ? keywordCoverage(job.keywords, draft, excluded, intl) : null;

  const title = editor.title;
  const previewOnly = breakpoints.previewToggle && previewShown;
  const editorVisible = !previewOnly;
  const previewVisible = !breakpoints.previewToggle || previewShown;

  const header = (
    <header className="border-line-subtle bg-surface-base shrink-0 border-b px-4 pt-3 pb-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <ScreenTitle title={title} className="text-title1 truncate" />
          <div className="text-fg-secondary mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote">
            <span className="bg-surface-selected text-fg-primary rounded-sm px-1.5 text-caption1">{editor.language.label}</span>
            <SyncStatus
              variant="editor"
              state={saveState ?? editor.saveStatus.state}
              {...(saveState === null && editor.saveStatus.state === "saved" && { savedAt: editor.saveStatus.time })}
              {...(saveState === "failed" && { onRetry: commit })}
            />
            {fromCache && <StaleStamp prefix="updated" time={updatedAt} clock={updatedClock} />}
            {editor.archivedAt && <span>{intl.formatMessage(messages.archivedNote, { time: editor.archivedAt.label })}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 pt-1">
          {breakpoints.previewToggle && (
            <Button
              size="sm"
              variant="secondary"
              icon={previewShown ? PenLine : Eye}
              shortcut="Mod+Shift+P"
              onClick={() => setPreviewShown((shown) => !shown)}
            >
              {intl.formatMessage(previewShown ? messages.showEditor : messages.showPreview)}
            </Button>
          )}
          {pending.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              icon={Sparkles}
              hint={intl.formatMessage(messages.pendingHint)}
              shortcut="F8"
              onClick={() => {
                setTab("suggestions");
                setInspectorOpen(true);
              }}
            >
              {intl.formatMessage(messages.pendingButton, { count: pending.length })}
            </Button>
          )}
          <IconButton icon={History} label={intl.formatMessage(messages.history)} shortcut="Mod+Shift+H" onClick={() => openHistory(cvId)} />
          <IconButton
            icon={PanelRight}
            label={intl.formatMessage(messages.showInspector)}
            shortcut="Mod+Shift+D"
            pressed={inspectorOpen}
            onClick={() => setInspectorOpen((open) => !open)}
          />
        </div>
      </div>
      {editor.variant && (
        <p className="text-fg-secondary mt-2 flex flex-wrap items-center gap-x-2 text-footnote">
          <span>{editor.variant.text}</span>
          {editor.variant.baseChange && (
            <>
              <span aria-hidden>·</span>
              <span className="text-fg-primary">{editor.variant.baseChange.label}</span>
            </>
          )}
          <Button size="sm" variant="plain" onClick={() => editor.variant && select(editor.variant.baseCvId)}>
            {intl.formatMessage(messages.openBase)}
          </Button>
        </p>
      )}
      {session.conflict && (
        <ConflictBanner
          onKeepMine={() => store.keepMine(cvId)}
          onUseTheirs={() => store.useTheirs(cvId)}
          onCompare={() => setCompare({ kind: "conflict" })}
        />
      )}
    </header>
  );

  const comparedRevision = compare?.kind === "revision" ? compare.revision : null;
  const comparedContent = comparedRevision ? editor.revisionContents[comparedRevision.revisionId] : undefined;
  const workingContent = comparedRevision ? store.content(cvId) : null;

  return (
    <div className="flex min-h-0 flex-1">
      <CvListPane
        list={model.list}
        selectedCvId={cvId}
        iconsOnly={iconsOnly}
        actions={{
          onSelect: select,
          onRename: (id, next) => {
            const record = model.records[id];
            if (!record) return;
            const previous = record.title;
            writeMetadata(id, { title: next });
            toast.show({
              message: intl.formatMessage(messages.renamed, { title: next }),
              action: undo(() => writeMetadata(id, { title: previous })),
            });
          },
          onHistory: openHistory,
          onArchive: (id) => {
            writeMetadata(id, { archivedAt: new Date() });
            if (id === cvId) {
              const other = Object.values(model.records).find((record) => record.cvId !== id && !record.archived);
              if (other) select(other.cvId);
            }
            toast.show({
              message: intl.formatMessage(messages.archived, { title: titleOf(id) }),
              action: undo(() => writeMetadata(id, { archivedAt: null })),
            });
          },
          onUnarchive: (id) => {
            writeMetadata(id, { archivedAt: null });
            toast.show({ variant: "info", message: intl.formatMessage(messages.unarchived, { title: titleOf(id) }) });
          },
          onDuplicate: creation.duplicate,
          onVariant: creation.openVariant,
          onNew: creation.openNew,
          onImport: creation.openImport,
        }}
      />
      <div ref={editorRef} className="relative flex min-h-0 min-w-0 flex-1">
        {editorVisible && (
          <div className={cx("flex min-h-0 min-w-[420px] flex-col", previewVisible ? "flex-[1_1_0] max-w-180" : "flex-1")}>
            <EditorPane
              editor={editor}
              draft={draft}
              header={header}
              collapsedSections={collapsed}
              expandedItems={expanded}
              pending={pending}
              fills={fills}
              ops={ops}
            />
          </div>
        )}
        {previewVisible && (
          <div className={cx("border-line-subtle flex min-h-0 min-w-0 flex-[1_1_0] flex-col", editorVisible && "border-l")}>
            {previewOnly && header}
            <PreviewPane
              draft={draft}
              paperLabel={editor.designOptions.paper.find((option) => option.value === draft.paperSize)?.label ?? ""}
              highlightId={highlightId}
              onLocate={locate}
            />
          </div>
        )}
        {inspectorOpen && (
          <Inspector
            editor={editor}
            draft={draft}
            tab={tab}
            onTab={setTab}
            overlay={!docked}
            onClose={() => setInspectorOpen(false)}
            suggestions={pending}
            fills={fills}
            coverage={coverage}
            jobId={jobId}
            onJob={(next) => {
              setJobId(next);
              setExcluded(new Set());
            }}
            onTheme={(patch) => edited((current) => ({ ...current, ...patch }))}
            onPersonal={(patch) => edited((current) => ({ ...current, ...patch }))}
            onAddSkill={(keyword) => {
              const result = addSkillKeyword(draft, keyword);
              if (!result) return;
              edited(() => result.draft);
              toast.show({
                message: intl.formatMessage(messages.skillAdded, { keyword }),
                action: undo(() => change((current) => removeSkillKeyword(current, result.itemId, keyword))),
              });
            }}
            onExclude={(keyword) => {
              setExcluded((current) => new Set(current).add(keyword));
              toast.show({
                message: intl.formatMessage(messages.excluded, { keyword }),
                action: undo(() =>
                  setExcluded((current) => {
                    const next = new Set(current);
                    next.delete(keyword);
                    return next;
                  }),
                ),
              });
            }}
            onUse={(id) => ops.useSuggestion(id, "done")}
            onKeep={ops.keepSuggestion}
            onKeepAll={keepAll}
            onShow={showSuggestion}
            onRestore={(revision) => {
              store.restore(cvId, revision.revisionId, intl.formatMessage(messages.restored, { date: revision.time.absolute }));
              toast.show({ message: intl.formatMessage(messages.restored, { date: revision.time.absolute }) });
            }}
            onCompare={(revision) => setCompare({ kind: "revision", revision })}
          />
        )}
      </div>
      {creation.dialogs}
      {compare?.kind === "conflict" && session.conflict && (
        <CompareDialog
          open
          onOpenChange={(open) => !open && setCompare(null)}
          title={intl.formatMessage(messages.compareConflictTitle)}
          description={intl.formatMessage(messages.compareConflictBody)}
          before={editor.revisionContents[session.conflict.theirsRevisionId] ?? session.conflict.ours}
          after={session.conflict.ours}
          sectionTitles={sectionTitles}
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  store.useTheirs(cvId);
                  setCompare(null);
                }}
              >
                {intl.formatMessage(conflictMessages.useTheirs)}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  store.keepMine(cvId);
                  setCompare(null);
                }}
              >
                {intl.formatMessage(conflictMessages.keepMine)}
              </Button>
            </>
          }
        />
      )}
      {comparedRevision && comparedContent && workingContent && (
        <CompareDialog
          open
          onOpenChange={(open) => !open && setCompare(null)}
          title={intl.formatMessage(messages.compareRevisionTitle)}
          description={intl.formatMessage(messages.compareRevisionBody, { date: comparedRevision.time.absolute })}
          before={comparedContent}
          after={workingContent}
          sectionTitles={sectionTitles}
        />
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/** No CVs yet, or none to open (all archived): the start choices. */
function NoCvOpen({ model, sectionTitle }: { model: CvEditorModel; sectionTitle: string }) {
  const creation = useCvCreation(model);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-8 pt-5">
        <ScreenTitle title={sectionTitle} />
      </div>
      {model.firstUse && <FirstUse firstUse={model.firstUse} creation={creation} />}
      {creation.dialogs}
    </div>
  );
}

export default function CvEditorScreen({ model }: ScreenProps<CvEditorModel>) {
  const intl = useIntl();
  const iconsOnly = useWindowQuery("listIcons");
  const sectionTitle = intl.formatMessage(destinationMessages.cvs);

  if (model.status === "loading") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="sr-only">
          <ScreenTitle title={sectionTitle} />
        </div>
        <LoadingLayout iconsOnly={iconsOnly} />
      </div>
    );
  }
  if (model.status === "error") {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-6 pt-5">
        <ScreenTitle title={sectionTitle} />
        <PaneError
          title={intl.formatMessage(messages.errorTitle)}
          body={intl.formatMessage(messages.errorBody)}
          onRetry={model.retry}
        />
      </div>
    );
  }
  const { data } = model;
  if (data.firstUse || !data.editor) return <NoCvOpen model={data} sectionTitle={sectionTitle} />;
  return (
    <Workspace
      model={data}
      editor={data.editor}
      fromCache={model.fromCache}
      updatedAt={model.updatedAt}
      updatedClock={model.updatedClock}
    />
  );
}
