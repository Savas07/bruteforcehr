/** DIAGNOSTIC ONLY (branch diag/cv-e2e-macos): an in-page trace the E2E spec prints. */
declare global {
  interface Window {
    __bfhrTrace?: string[];
  }
}

export function trace(...parts: unknown[]): void {
  if (!__BFHR_E2E__) return;
  const list = (window.__bfhrTrace ??= []);
  const text = parts.map((part) => (typeof part === "string" ? part : JSON.stringify(part))).join(" ");
  list.push(`${new Date().toISOString().slice(11, 23)} ${text.slice(0, 400)}`);
  if (list.length > 6000) list.splice(0, list.length - 6000);
}
