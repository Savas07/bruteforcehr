import { RouterProvider } from "@tanstack/react-router";
import { setNonce } from "get-nonce";
import { Tooltip } from "radix-ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import { router } from "./router";

// Radix injects its scroll-lock <style> through get-nonce; the CSP only admits styles carrying
// this per-load nonce (written by the app:// handler; absent in dev, where CSP is relaxed).
const nonce = document.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]')?.nonce;
if (nonce) setNonce(nonce);

document.documentElement.dataset["platform"] = window.bfhr.platform;
document.documentElement.dataset["material"] = window.bfhr.material;

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <Tooltip.Provider delayDuration={600}>
      <RouterProvider router={router} />
    </Tooltip.Provider>
  </StrictMode>,
);
