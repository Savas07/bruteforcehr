import { timing } from "@bfhr/ui-tokens";
import { RouterProvider } from "@tanstack/react-router";
import { setNonce } from "get-nonce";
import { Tooltip } from "radix-ui";
import { StrictMode, useEffect, useMemo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import { RawIntlProvider } from "react-intl";
import { createAppIntl } from "./i18n/intl";
import { chrome } from "./lib/desktop";
import { appLocaleFor, applyAppearance, devicePreferences, useDevicePreferences } from "./lib/preferences";
import { markPerf } from "./lib/perf";
import { productionViews, router, RouteViewsContext } from "./router";

// Test builds: the cold-start breakdown (src/lib/perf.ts); the bundle has loaded.
markPerf("script-start");

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

// Appearance: this computer's choice (Settings › General), else the OS. Design builds pin it per
// route (`?theme=`).
if (!__BFHR_DESIGN__) applyAppearance(devicePreferences().appearance);

/**
 * The UI language: this computer's choice (Settings › General), else the OS locale (English
 * fallback). A change in Settings re-renders the app in the new language.
 */
function AppIntl({ children }: { readonly children: ReactNode }) {
  const { language } = useDevicePreferences();
  const intl = useMemo(
    () => createAppIntl(appLocaleFor(language, [chrome.locale, ...navigator.languages])),
    [language],
  );
  useEffect(() => {
    document.documentElement.lang = intl.locale;
  }, [intl.locale]);
  return <RawIntlProvider value={intl}>{children}</RawIntlProvider>;
}

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <AppIntl>
      <Tooltip.Provider delayDuration={timing.tooltipDelay}>
        <RouteViewsContext.Provider value={views}>
          <RouterProvider router={router} />
        </RouteViewsContext.Provider>
      </Tooltip.Provider>
    </AppIntl>
  </StrictMode>,
);
