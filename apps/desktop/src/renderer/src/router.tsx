import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
} from "@tanstack/react-router";
import { destinations, type Destination } from "../../shared/destinations";
import { AppShell } from "./components/AppShell";
import { RouteContainer } from "./components/RouteContainer";

const startPath = destinations[0].path;

const rootRoute = createRootRoute({
  component: AppShell,
  notFoundComponent: () => <Navigate to={startPath} replace />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <Navigate to={startPath} replace />,
});

const destinationRoutes = destinations.map((destination: Destination) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: destination.path,
    component: () => <RouteContainer title={destination.label} />,
  }),
);

/**
 * Hash history: the renderer is served from `app://bfhr/index.html` in production, so routes
 * live in the fragment and never cause a document navigation.
 */
export const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, ...destinationRoutes]),
  history: createHashHistory(),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
