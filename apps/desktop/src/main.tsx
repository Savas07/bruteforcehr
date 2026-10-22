import { RouterProvider } from "@tanstack/react-router";
import { setNonce } from "get-nonce";
import { Tooltip } from "radix-ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import { chrome } from "./lib/desktop";
import { router } from "./router";

// Test builds (`vite build --mode e2e`) load the WebdriverIO bridge; production builds drop this.
if (import.meta.env.MODE === "e2e") void import("@wdio/tauri-plugin");

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
    <Tooltip.Provider delayDuration={600}>
      <RouterProvider router={router} />
    </Tooltip.Provider>
  </StrictMode>,
);
