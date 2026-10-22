# ADR 0006 — Hosting, domains and OAuth redirect URIs

- **Status:** Accepted
- **Date:** 2026-10-22
- **Supersedes:** BRIEF.md §0 "Domain" and §6 "Website: Astro on GitHub Pages"
- **Related:** [0001-stack.md](0001-stack.md), [0003-auth-email-otp.md](0003-auth-email-otp.md), [0004-release-updates-signing.md](0004-release-updates-signing.md), [runbooks/accounts.md](../runbooks/accounts.md)

## Context

- The owner has **no custom domain** for now. BRIEF §0 notes OAuth redirect URIs need a domain we control.
- Every Firebase Hosting site gets free default subdomains `PROJECT_ID.web.app` and `PROJECT_ID.firebaseapp.com` ([Connect a custom domain — Firebase Hosting](https://firebase.google.com/docs/hosting/custom-domain)). For project `bruteforcehr` that is **`https://bruteforcehr.web.app`**.
- Hosting can rewrite URL paths to Cloud Functions; for functions outside `us-central1` the `region` must be set (or is auto-detected from source); Hosting requests time out after **60 s** ([Serve dynamic content with Cloud Functions](https://firebase.google.com/docs/hosting/functions); [Configure Hosting behavior](https://firebase.google.com/docs/hosting/full-config)).
- Google OAuth: apps with **External** user type in **Testing** status get refresh tokens that **expire after 7 days** ([Using OAuth 2.0 — refresh token expiration](https://developers.google.com/identity/protocols/oauth2); [Data Portability — configure OAuth](https://developers.google.com/data-portability/user-guide/configure-oauth?hl=en)). Redirect URI domains must be listed as **authorized domains**, and ownership of authorized domains is proven with **Google Search Console** ([Comply with OAuth 2.0 policies](https://developers.google.com/identity/verification/authentication-policy-compliance); [Brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)).
- Search Console supports **HTML file upload** verification for URL-prefix properties ([Verify your site ownership](https://support.google.com/webmasters/answer/9008080?hl=en)) — a static file we can serve from Hosting.
- Microsoft identity platform redirect URIs for a web (confidential) client must be HTTPS ([Add a redirect URI / register an app](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)).

## Decision

### One Hosting site: `bruteforcehr.web.app`

`firebase.json` → `hosting`:

```jsonc
{
  "hosting": {
    "public": "apps/web/dist",
    "cleanUrls": true,
    "trailingSlash": false,
    "rewrites": [
      { "source": "/api/**",     "function": { "functionId": "api",     "region": "europe-west1" } },
      { "source": "/connect/**", "function": { "functionId": "connect", "region": "europe-west1" } }
    ],
    "headers": [ /* security headers: HSTS, CSP, X-Content-Type-Options, Referrer-Policy */ ]
  }
}
```

- `/` … static Astro website (Home, Features, Download, Changelog, Privacy, Terms, Support).
- `/api/**` → `api` (HTTPS `onRequest`, gen2, `europe-west1`): app API (auth code start/verify, AI, render, send, job import). Calls must finish within Hosting's 60 s; longer work is enqueued to task-queue functions and reported through Firestore.
- `/connect/**` → `connect`: mail-account OAuth start + callbacks.
- Function names `api` and `connect` are the contract between Hosting and `apps/functions`.

### OAuth redirect URIs

| Provider | Redirect URI | Notes |
|---|---|---|
| Google (Gmail) | `https://bruteforcehr.web.app/connect/google/callback` | OAuth client type **Web application**; authorized domain `bruteforcehr.web.app` (or `web.app` parent as Console accepts) |
| Microsoft (Graph) | `https://bruteforcehr.web.app/connect/microsoft/callback` | Platform **Web**, authority `common` |
| App return | `bruteforcehr://connected?account=<id>` | After callback, `connect` redirects to the app scheme; desktop and iOS also see `mailAccounts/{id}` change via snapshot listener |

Flow (from BRIEF §6.4): client opens `https://bruteforcehr.web.app/connect/{google|microsoft}?nonce=<short-lived signed nonce>` in the system browser (iOS: `ASWebAuthenticationSession` via `expo-web-browser`); `connect` runs authorization code + PKCE, validates `state`, stores tokens encrypted under `serverOnly/**`, redirects to `bruteforcehr://connected`.

### Google consent screen, authorized domain, Search Console

1. In Search Console add a **URL-prefix property** `https://bruteforcehr.web.app/` and choose **HTML file**; commit the `google<token>.html` file to `apps/web/public/` and deploy Hosting; click Verify. Use the same Google account that owns the GCP project.
2. OAuth consent screen (Google Auth Platform → Branding): app name BruteForceHR, home page `https://bruteforcehr.web.app/`, privacy `https://bruteforcehr.web.app/privacy`, terms `https://bruteforcehr.web.app/terms`, authorized domain `bruteforcehr.web.app`.
3. Audience: **External**, publishing status **In production** (not Testing — 7-day token expiry). The app stays **unverified**; the owner clicks through the unverified-app warning (personal use; < 100 users).
4. Exact steps in [runbooks/accounts.md](../runbooks/accounts.md).

Risk: `web.app` is a shared Firebase domain. If Google rejects `bruteforcehr.web.app` as an authorized domain or later requires verification (e.g. any non-owner user), a custom domain becomes mandatory (see migration).

### Firebase Auth

Sign-in uses custom tokens ([0003-auth-email-otp.md](0003-auth-email-otp.md)), so no Firebase Auth redirect domain is involved; `bruteforcehr.web.app` and `bruteforcehr.firebaseapp.com` are on the Auth authorized-domains list by default.

## Migration path to a custom domain (later)

1. Buy domain (e.g. `bruteforcehr.app`); Hosting → **Add custom domain**, add the TXT/A records, wait for the managed certificate ([Connect a custom domain](https://firebase.google.com/docs/hosting/custom-domain)).
2. Keep `bruteforcehr.web.app` serving the same site (it can't be removed), so old links and redirect URIs keep working.
3. Verify the domain property in Search Console (DNS TXT), add it to the consent screen authorized domains.
4. **Add** new redirect URIs (`https://<domain>/connect/{google,microsoft}/callback`) alongside the old ones in Google and Entra; ship a release whose functions use the new base URL (config param `PUBLIC_BASE_URL`); remove old URIs only after all accounts have re-authed or tokens refreshed (refresh tokens are not bound to the redirect URI).
5. Update `appConfig`, website canonical URLs, privacy/terms links, the Brevo sender domain (DKIM/SPF for proper deliverability), and the honest scraping User-Agent URL (ADR 0005).
6. Optional: `web.app` → custom domain 301 redirect for website pages only (never for `/connect/**` until old URIs are retired).

## Consequences

- Zero-cost hosting with TLS; website and API share one origin (no CORS for the website; the desktop renderer calls `https://bruteforcehr.web.app/api/...`).
- Hosting's 60 s timeout shapes the API: long operations are asynchronous.
- Branding/verification is limited on a shared domain; acceptable while the app is personal.
- Email OTP sends from a Brevo-verified single sender (no own domain ⇒ no custom DKIM); deliverability may be lower until a domain exists.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Buy a custom domain now | Owner chose not to yet; web.app works for an unverified personal OAuth app. Migration path above. |
| GitHub Pages for the website (brief default) | Second host; OAuth callbacks and API need Firebase anyway. One Hosting site serves both. |
| Calling function URLs directly (`*.run.app` / `cloudfunctions.net`) | Unstable, unbranded hosts in redirect URIs; separate origin from the website; harder to migrate. |
| `bruteforcehr.firebaseapp.com` as primary | Equivalent; `web.app` is the current default Firebase presents and is shorter. |
| Loopback/custom-scheme redirect URIs (installed-app OAuth) | Tokens must be held server-side for background mail sync (BRIEF §6.4); a confidential web client with server callback is required. |
