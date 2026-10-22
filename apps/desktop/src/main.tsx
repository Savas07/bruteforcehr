import { timing } from "@bfhr/ui-tokens";
import { RouterProvider } from "@tanstack/react-router";
import { setNonce } from "get-nonce";
import { Tooltip } from "radix-ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import { chrome } from "./lib/desktop";
import { productionViews, router, RouteViewsContext } from "./router";

// Test builds (`--mode e2e` / `design-e2e`) load the WebdriverIO bridge; production builds drop this.
if (__BFHR_E2E__) void import("@wdio/tauri-plugin");

// Design builds swap in the fixture-driven prototypes (src/design/). The branch is a compile-time
// constant, so production bundles contain neither the design code nor @bfhr/fixtures.
const views = __BFHR_DESIGN__ ? (await import("./design/views")).designViews : productionViews;

// Radix injects its scroll-lock <style> through get-nonce; the CSP admits only styles carrying
// the per-load nonce Tauri writes into index.html. (`tauri dev` serves the token unreplaced; its
// dev CSP allows inline styles.)
const nonce = document.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]')?.nonce;
if (nonce) setNonce(nonce);

document.documentElement.dataset["platform"] = chrome.platform;
document.documentElement.dataset["material"] = chrome.material;

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <Tooltip.Provider delayDuration={timing.tooltipDelay}>
      <RouteViewsContext.Provider value={views}>
        <RouterProvider router={router} />
      </RouteViewsContext.Provider>
    </Tooltip.Provider>
  </StrictMode>,
);
