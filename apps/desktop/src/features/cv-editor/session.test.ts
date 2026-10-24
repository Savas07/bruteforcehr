// @vitest-environment happy-dom
import { FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureContext } from "../../shared/model/fixture-context";
import { setTextAt } from "./draft";
import { createMemoryCvStore, type MemoryCvStore } from "./memoryBackend";
import { buildCvEditorModel, type CvEditorVM } from "./model";
import { CvSessionStore, SESSION_IDLE_MS } from "./session";

const CV = "cv-en";
const bullet = { sectionKey: "work", itemId: "work-0", bulletIndex: 0 } as const;

let memory: MemoryCvStore;
let store: CvSessionStore;

function editor(): CvEditorVM {
  const vm = buildCvEditorModel(memory.data(), fixtureContext(populatedDataset), { cvId: CV }).editor;
  if (!vm) throw new Error("no editor");
  return vm;
}
const revisionsOf = () => memory.data().cvRevisions.filter((revision) => revision.cvId === CV);
/** Lets the memory backend's settled writes run their `then` handlers (microtasks only). */
async function settle(): Promise<void> {
  for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  window.localStorage.clear();
  memory = createMemoryCvStore(populatedDataset.uid, populatedDataset, () => FIXTURE_NOW);
  store = new CvSessionStore(memory.backend, (sections) => `Edited ${sections.join(", ")}`);
  store.view(editor());
});
afterEach(() => vi.useRealTimers());

describe("editing sessions", () => {
  it("writes one revision per session, not per edit", () => {
    const before = revisionsOf().length;
    store.edit(CV, (draft) => setTextAt(draft, bullet, "One"));
    store.edit(CV, (draft) => setTextAt(draft, bullet, "One two"));
    store.edit(CV, (draft) => setTextAt(draft, bullet, "One two three"));
    expect(revisionsOf()).toHaveLength(before);
    expect(store.view(editor()).status).toBe("editing");

    vi.advanceTimersByTime(SESSION_IDLE_MS);
    expect(revisionsOf()).toHaveLength(before + 1);
    const latest = memory.data().cvRevisions.at(-1);
    expect(latest?.content.work?.[0]?.highlights?.[0]).toBe("One two three");
    expect(latest?.diffSummary).toBe("Edited work");
    expect(memory.data().cvs.find((cv) => cv.id === CV)?.currentRevisionId).toBe(latest?.id);
  });

  it("keeps the working copy on this device until the session ends", () => {
    store.edit(CV, (draft) => setTextAt(draft, bullet, "Kept"));
    vi.advanceTimersByTime(600);
    const key = `bfhr.cv-session.${populatedDataset.uid}.${CV}`;
    expect(window.localStorage.getItem(key)).toContain("Kept");
    // A new window (after a crash) picks it up.
    const again = new CvSessionStore(memory.backend, () => "");
    const snapshot = again.view(editor());
    expect(snapshot.status).toBe("editing");
    expect(snapshot.draft.sections.find((section) => section.key === "work")?.items[0]?.bullets[0]).toBe("Kept");
    store.commit(CV);
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("writes nothing when the session changed nothing", () => {
    const before = revisionsOf().length;
    const original = store.view(editor()).draft;
    store.edit(CV, (draft) => setTextAt(draft, bullet, "temporary"));
    store.edit(CV, () => original);
    store.commit(CV);
    expect(revisionsOf()).toHaveLength(before);
  });

  it("continues on its own writes without calling them conflicts", async () => {
    store.edit(CV, (draft) => setTextAt(draft, bullet, "First"));
    store.commit(CV);
    await settle();
    store.view(editor());
    store.edit(CV, (draft) => setTextAt(draft, bullet, "Second"));
    store.commit(CV);
    await settle();
    const snapshot = store.view(editor());
    expect(snapshot.conflict).toBeNull();
    expect(snapshot.status).toBe("saved");
    expect(memory.data().cvRevisions.at(-1)?.content.work?.[0]?.highlights?.[0]).toBe("Second");
  });

  it("doesn't take the editor from before its own write for a remote save", async () => {
    // useSyncExternalStore re-reads the store with the last rendered editor (still on the old
    // revision) until the snapshot of our write arrives.
    const before = editor();
    store.edit(CV, (draft) => setTextAt(draft, bullet, "Mine"));
    store.commit(CV);
    expect(store.view(before).conflict).toBeNull();
    await settle();
    const saved = store.view(before);
    expect(saved.conflict).toBeNull();
    expect(saved.draft.sections.find((section) => section.key === "work")?.items[0]?.bullets[0]).toBe("Mine");
    expect(store.view(editor())).toMatchObject({ conflict: null, status: "saved" });
  });

  it("turns a remote save during a session into a conflict; Keep this version wins on top", () => {
    store.edit(CV, (draft) => setTextAt(draft, bullet, "Mine"));
    const theirs = editor().revisionContents[editor().currentRevisionId];
    if (!theirs) throw new Error("no content");
    memory.simulateRemoteEdit(CV, { ...theirs, basics: { ...theirs.basics, label: "Theirs" } });
    const snapshot = store.view(editor());
    expect(snapshot.conflict?.theirsRevisionId).toBe(editor().currentRevisionId);

    store.keepMine(CV);
    const latest = memory.data().cvRevisions.at(-1);
    expect(latest?.content.work?.[0]?.highlights?.[0]).toBe("Mine");
    expect(memory.data().cvs.find((cv) => cv.id === CV)?.currentRevisionId).toBe(latest?.id);
    expect(store.view(editor()).conflict).toBeNull();
  });

  it("keeps a rejected write as an orphan revision and adopts it on Keep this version", async () => {
    store.edit(CV, (draft) => setTextAt(draft, bullet, "Mine"));
    // The other device saves, but this window hasn't seen the snapshot yet: our write is stale.
    const content = editor().revisionContents[editor().currentRevisionId];
    if (!content) throw new Error("no content");
    memory.simulateRemoteEdit(CV, { ...content, basics: { ...content.basics, label: "Theirs" } });
    store.commit(CV);
    await settle();
    const conflict = store.view(editor()).conflict;
    expect(conflict?.orphanRevisionId).toBeTruthy();

    store.keepMine(CV);
    await settle();
    expect(memory.data().cvs.find((cv) => cv.id === CV)?.currentRevisionId).toBe(conflict?.orphanRevisionId);
  });

  it("Use the other version drops the working copy", () => {
    store.edit(CV, (draft) => setTextAt(draft, bullet, "Mine"));
    const content = editor().revisionContents[editor().currentRevisionId];
    if (!content) throw new Error("no content");
    memory.simulateRemoteEdit(CV, { ...content, basics: { ...content.basics, label: "Theirs" } });
    store.view(editor());
    store.useTheirs(CV);
    const snapshot = store.view(editor());
    expect(snapshot.conflict).toBeNull();
    expect(snapshot.status).toBe("idle");
    expect(snapshot.draft.header.headline).toBe("Theirs");
  });

  it("restores an old version as a new revision", () => {
    const first = revisionsOf().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    if (!first) throw new Error("no revisions");
    const before = revisionsOf().length;
    store.restore(CV, first.id, "Restored");
    const latest = memory.data().cvRevisions.at(-1);
    expect(revisionsOf()).toHaveLength(before + 1);
    expect(latest?.content).toEqual(first.content);
    expect(latest?.basedOnRevisionId).toBe(first.id);
    expect(memory.data().cvs.find((cv) => cv.id === CV)?.currentRevisionId).toBe(latest?.id);
  });
});
