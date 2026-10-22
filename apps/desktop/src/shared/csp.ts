/**
 * Vite writes this placeholder into the built index.html (`html.cspNonce`): on every <script>/<link>
 * tag and in `<meta property="csp-nonce">`. The app:// handler swaps it for a fresh nonce per load.
 */
export const CSP_NONCE_PLACEHOLDER = "__BFHR_CSP_NONCE__";

/**
 * Renderer Content-Security-Policy. Production is sent as a response header by the app:// handler.
 * Styles injected at runtime (Radix's scroll lock) must carry the per-load nonce. The dev variant
 * (a <meta> tag from the Vite plugin) also allows what HMR needs: the React Refresh inline
 * preamble, injected <style> tags and the dev server's websocket; meta tags can't carry
 * frame-ancestors.
 */
export function contentSecurityPolicy(mode: { dev: true } | { dev: false; nonce: string }): string {
  const common = [
    "default-src 'none'",
    "img-src 'self' data:",
    "font-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ];
  const specific = mode.dev
    ? [
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "connect-src 'self' ws://localhost:* http://localhost:*",
      ]
    : [
        "script-src 'self'",
        `style-src 'self' 'nonce-${mode.nonce}'`,
        "connect-src 'self'",
        "frame-ancestors 'none'",
      ];
  return [...common, ...specific].join("; ");
}
