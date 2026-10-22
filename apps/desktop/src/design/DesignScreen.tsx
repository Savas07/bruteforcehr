import { emptyDataset, FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import { timing } from "@bfhr/ui-tokens";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, type ComponentType } from "react";
import { fixtureContext } from "../shared/model/fixture-context";
import { clockTime, relativeTime } from "../shared/model/format";
import type { Loadable, ModelContext, UserData } from "../shared/model/types";
import type { ScreenId, ScreenProps } from "../shared/screen";
import { ScreenTitle } from "../shared/ui/ScreenTitle";
import { DESIGN_READY_ATTRIBUTE } from "./matrix";
import { readDesignParams } from "./search";

/** How the design build feeds one core screen. */
export interface DesignScreenSpec<Model> {
  readonly id: ScreenId;
  /** Section title for the placeholder shown until the screen's view exists. */
  readonly title: string;
  readonly build: (
    data: UserData,
    ctx: ModelContext,
    params: Readonly<Record<string, string | undefined>>,
  ) => Model;
  /**
   * Document ids marked as local writes in `?state=offline` (they show `SyncGlyph`). Exactly
   * `OFFLINE_PENDING_WRITES` ids, so the sidebar count matches what the screen shows.
   */
  readonly offlinePending: (data: UserData, ctx: ModelContext) => readonly string[];
}

// Screen views are discovered, not registered: a screen agent adds `src/features/<id>/Screen.tsx`
// (default export taking `ScreenProps<Model>`) and its route renders it, with no shared file to
// edit. `import.meta.glob` is resolved by Vite at build time.
const views = import.meta.glob<{ default: ComponentType<ScreenProps<never>> }>("../features/*/Screen.tsx", {
  eager: true,
});

/** Shown until `src/features/<id>/Screen.tsx` exists (design builds only). */
function NoViewYet({ spec }: { spec: DesignScreenSpec<unknown> }) {
  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-8 pt-5 pb-8">
      <ScreenTitle title={spec.title} />
      <p className="text-fg-secondary mt-2 text-callout">
        Design harness: add <code className="font-mono">src/features/{spec.id}/Screen.tsx</code> to render
        this screen. Its model is ready in <code className="font-mono">src/features/{spec.id}/model.ts</code>.
      </p>
    </section>
  );
}

/** Ready once the forced state has painted; skeletons appear after `timing.skeletonDelay`. */
function useDesignReady(key: string, loading: boolean): void {
  useEffect(() => {
    const root = document.documentElement;
    root.removeAttribute(DESIGN_READY_ATTRIBUTE);
    let cancelled = false;
    const settle = loading ? timing.skeletonDelay + 150 : 50;
    void document.fonts.ready.then(() => {
      setTimeout(() => {
        if (!cancelled) root.setAttribute(DESIGN_READY_ATTRIBUTE, "true");
      }, settle);
    });
    return () => {
      cancelled = true;
    };
  }, [key, loading]);
}

/** The cache stamp of a design `ready` model: online data was just fetched, offline is 25 min old. */
const cacheAge = { ready: 0, offline: 25 * 60_000 } as const;

/**
 * Renders one core screen from fixtures with the state the route forces
 * (docs/design/foundation-desktop.md "Design build"):
 * `?fixture=populated|empty` picks the dataset, `?state=loading|error|offline` forces the load
 * or connection state, route params and the other search params become `params`.
 */
export function DesignScreen<Model>({
  spec,
  view,
}: {
  spec: DesignScreenSpec<Model>;
  /** Render this instead of the discovered `Screen.tsx` (the shared-component demo). */
  view?: ComponentType<ScreenProps<Model>>;
}) {
  const search = readDesignParams(useSearch({ strict: false }));
  const routeParams: Readonly<Record<string, string | undefined>> = useParams({ strict: false });
  const navigate = useNavigate();
  // Search and route params are fresh objects every render: key the memo on their content.
  const paramsKey = JSON.stringify({ ...search.rest, ...routeParams });
  const params = useMemo(
    (): Readonly<Record<string, string | undefined>> => JSON.parse(paramsKey),
    [paramsKey],
  );

  const model = useMemo((): Loadable<Model> => {
    const data = search.fixture === "empty" ? emptyDataset : populatedDataset;
    switch (search.state) {
      case "loading":
        return { status: "loading" };
      case "error":
        return {
          status: "error",
          retry: () =>
            void navigate({
              to: ".",
              search: (previous: Readonly<Record<string, unknown>>) => ({ ...previous, state: "ready" }),
            }),
        };
      case "ready":
      case "offline": {
        const offline = search.state === "offline";
        const base = fixtureContext(data);
        const ctx = offline ? fixtureContext(data, spec.offlinePending(data, base)) : base;
        const updatedAt = new Date(FIXTURE_NOW.getTime() - cacheAge[search.state]);
        return {
          status: "ready",
          data: spec.build(data, ctx, params),
          fromCache: offline,
          updatedAt: relativeTime(updatedAt, ctx),
          updatedClock: clockTime(updatedAt, ctx),
        };
      }
    }
  }, [search.fixture, search.state, spec, params, navigate]);

  useDesignReady(`${spec.id}:${search.fixture}:${search.state}:${paramsKey}`, model.status === "loading");

  const View =
    view ??
    (views[`../features/${spec.id}/Screen.tsx`]?.default as ComponentType<ScreenProps<Model>> | undefined);
  return View ? (
    <View model={model} params={params} />
  ) : (
    <NoViewYet spec={spec as DesignScreenSpec<unknown>} />
  );
}
