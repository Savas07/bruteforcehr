import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
} from "@tanstack/react-router";
import { createContext, lazy, Suspense, useContext, useEffect, type ComponentType } from "react";
import { AppShell } from "./components/AppShell";
import { RouteContainer } from "./components/RouteContainer";
import { destinations, type DestinationId } from "./lib/destinations";
import { InterviewReminders } from "./data/tracker/InterviewReminders";
import { LiveTrackerProvider } from "./data/tracker/live";
import { LiveMailProvider } from "./data/mail/live";
import { AddApplicationHost } from "./features/application-add";
import { MailConnectHost } from "./features/mail-connect";
import { MailNotificationsHost } from "./features/settings";
import { SETTINGS_START_PANE } from "./lib/settings";
import LiveToday from "./features/today/Live";
import { TrackerViewsRoute } from "./features/tracker-table/ViewSwitch";

// Every section but Today (the start screen) loads on first visit, so a cold start parses only
// what Today needs: the CV Studio alone brings cv-render, pdf.js and docx (docs/runbooks/performance.md).
// `usePreloadSections` fetches them all shortly after launch, so first visits don't wait either.
const loadSettings = () => import("./features/settings/Live");
const loadApplicationDetail = () => import("./features/application-detail/Live");
const loadJobs = () => import("./features/job-detail/Live");
const loadCvStudio = () => import("./features/cv-editor/LiveCvStudio");
const loadInsights = () => import("./features/insights/LiveInsights");
const loadMailReview = () => import("./features/mail-review/Live");
const loadTrackerBoard = () => import("./features/tracker-board/Live");
const loadTrackerTable = () => import("./features/tracker-table/Live");
const LiveSettings = lazy(loadSettings);
const LiveApplicationDetail = lazy(loadApplicationDetail);
const LiveJobs = lazy(loadJobs);
const LiveCvStudio = lazy(loadCvStudio);
const LiveInsights = lazy(loadInsights);
const LiveMailReview = lazy(loadMailReview);
const LiveTrackerBoard = lazy(loadTrackerBoard);
const LiveTrackerTable = lazy(() =>
  loadTrackerTable().then((module) => ({ default: module.LiveTrackerTable })),
);
const LiveTrackerCalendar = lazy(() =>
  loadTrackerTable().then((module) => ({ default: module.LiveTrackerCalendar })),
);

/** How long after the shell mounts the other sections start loading (after Today's own work). */
const PRELOAD_DELAY_MS = 3_000;

function usePreloadSections(): void {
  useEffect(() => {
    const timer = setTimeout(() => {
      for (const load of [
        loadSettings,
        loadApplicationDetail,
        loadJobs,
        loadCvStudio,
        loadInsights,
        loadMailReview,
        loadTrackerBoard,
        loadTrackerTable,
      ])
        void load();
    }, PRELOAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
}

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
  /** Full-page application detail (IA.md deep links: `bruteforcehr://applications/{id}`). */
  application: { path: "/tracker/applications/$applicationId", destination: "tracker" },
  cvs: { path: "/cvs", destination: "cvs" },
  cv: { path: "/cvs/$cvId", destination: "cvs" },
  mail: { path: "/mail", destination: "mail" },
  mailReview: { path: "/mail/review/$messageId", destination: "mail" },
  insights: { path: "/insights", destination: "insights" },
  /** Settings › a pane (`Mod+,`, the menu, the sidebar row); not a numbered destination. */
  settings: { path: "/settings/$pane", destination: null },
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

/** The signed-in shell with the app-wide hosts (Mod+N dialog, interview reminders). */
function LiveRoot() {
  usePreloadSections();
  return (
    <AppShell
      hosts={
        <LiveTrackerProvider>
          <LiveMailProvider>
            <AddApplicationHost />
            <InterviewReminders />
            <MailConnectHost />
            <MailNotificationsHost />
          </LiveMailProvider>
        </LiveTrackerProvider>
      }
    />
  );
}

/** A route on the signed-in user's tracker and mail listeners. */
const live = (View: ComponentType): ComponentType =>
  function LiveRoute() {
    return (
      <LiveTrackerProvider>
        <LiveMailProvider>
          <View />
        </LiveMailProvider>
      </LiveTrackerProvider>
    );
  };

const liveTrackerViews = {
  board: LiveTrackerBoard,
  table: LiveTrackerTable,
  calendar: LiveTrackerCalendar,
} as const;

/** Tracker › Board · Table · Calendar (`?view=`). */
function LiveTracker() {
  return <TrackerViewsRoute views={liveTrackerViews} />;
}

/**
 * Production: CVs (M2), Today, Tracker, application detail and Insights (M3), Jobs (M4), Mail and
 * Settings (M5) run on live data; other areas show their title until their milestone.
 */
export const productionViews: RouteViews = {
  root: LiveRoot,
  routes: {
    ...(Object.fromEntries(
      Object.keys(appRoutes).map((id) => [id, sectionTitle(id as AppRouteId)]),
    ) as Record<AppRouteId, ComponentType>),
    cvs: live(LiveCvStudio),
    cv: live(LiveCvStudio),
    insights: LiveInsights,
    today: live(LiveToday),
    tracker: live(LiveTracker),
    application: live(LiveApplicationDetail),
    jobs: live(LiveJobs),
    job: live(LiveJobs),
    mail: live(LiveMailReview),
    mailReview: live(LiveMailReview),
    settings: live(LiveSettings),
  },
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
      // A section's chunk is fetched from the app's own assets in milliseconds: nothing to show.
      return (
        <Suspense fallback={null}>
          <View />
        </Suspense>
      );
    },
  });

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/", component: RedirectToStart }),
    route("today"),
    route("jobs"),
    route("job"),
    route("tracker"),
    route("application"),
    route("cvs"),
    route("cv"),
    route("mail"),
    route("mailReview"),
    route("insights"),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/settings",
      component: function SettingsStart() {
        return <Navigate to="/settings/$pane" params={{ pane: SETTINGS_START_PANE }} replace />;
      },
    }),
    route("settings"),
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
