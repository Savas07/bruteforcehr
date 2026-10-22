import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
} from "@tanstack/react-router";
import { createContext, useContext, type ComponentType } from "react";
import { AppShell } from "./components/AppShell";
import { RouteContainer } from "./components/RouteContainer";
import { destinations, type DestinationId } from "./lib/destinations";

const startPath = destinations[0].path;

/**
 * Every route of the app (paths follow IA.md § Deep links). Production and design builds share
 * this one tree, so `Link to` and `navigate` are typed the same everywhere; they differ only in
 * the views they provide through `RouteViewsContext`.
 */
export const appRoutes = {
  today: { path: "/today", destination: "today" },
  jobs: { path: "/jobs", destination: "jobs" },
  job: { path: "/jobs/$jobId", destination: "jobs" },
  tracker: { path: "/tracker", destination: "tracker" },
  cvs: { path: "/cvs", destination: "cvs" },
  cv: { path: "/cvs/$cvId", destination: "cvs" },
  mail: { path: "/mail", destination: "mail" },
  mailReview: { path: "/mail/review/$messageId", destination: "mail" },
  /** Design builds only: the screen × state index and the shared-component demo. */
  design: { path: "/design", destination: null },
  designDemo: { path: "/design/demo", destination: null },
} as const satisfies Record<string, { path: string; destination: DestinationId | null }>;

export type AppRouteId = keyof typeof appRoutes;

/** What each route renders, plus the layout around all of them. */
export interface RouteViews {
  readonly root: ComponentType;
  readonly routes: Readonly<Record<AppRouteId, ComponentType>>;
}

const RedirectToStart = () => <Navigate to={startPath} replace />;

function sectionTitle(id: AppRouteId): ComponentType {
  const destination = appRoutes[id].destination;
  if (destination === null) return RedirectToStart;
  return function Section() {
    return <RouteContainer destination={destination} />;
  };
}

/** Production: the title-only shell. Real screens land with their milestones. */
export const productionViews: RouteViews = {
  root: AppShell,
  routes: Object.fromEntries(
    Object.keys(appRoutes).map((id) => [id, sectionTitle(id as AppRouteId)]),
  ) as Record<AppRouteId, ComponentType>,
};

export const RouteViewsContext = createContext<RouteViews>(productionViews);

const rootRoute = createRootRoute({
  component: function Root() {
    const { root: Root } = useContext(RouteViewsContext);
    return <Root />;
  },
  notFoundComponent: RedirectToStart,
});

const route = <Id extends AppRouteId>(id: Id) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: appRoutes[id].path,
    component: function RouteView() {
      const View: ComponentType = useContext(RouteViewsContext).routes[id];
      return <View />;
    },
  });

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/", component: RedirectToStart }),
    route("today"),
    route("jobs"),
    route("job"),
    route("tracker"),
    route("cvs"),
    route("cv"),
    route("mail"),
    route("mailReview"),
    route("design"),
    route("designDemo"),
  ]),
  // Hash history: Tauri serves index.html from its asset origin, so routes live in the fragment
  // and never cause a document navigation (the navigation guard in src-tauri stays strict).
  history: createHashHistory(),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
