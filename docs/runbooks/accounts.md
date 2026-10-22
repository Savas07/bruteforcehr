# Runbook — accounts, keys and secrets the owner must set up

Owner actions that agents cannot do (accounts, money, legal). Each section ends with where the value goes. **Never paste secrets into chat, issues, commits or client code.** Runtime secrets go to Secret Manager with `firebase functions:secrets:set` ([Configure your environment — secrets](https://firebase.google.com/docs/functions/config-env)); CI secrets go to GitHub → `Savas07/bruteforcehr` → Settings → Secrets and variables → Actions.

Run `firebase` commands from the repo root (`/Users/savas/Desktop/BruteForceHR`, project `bruteforcehr` from `.firebaserc`). `functions:secrets:set` prompts for the value (paste, Enter) and creates a new secret version; functions pick it up on next deploy.

| # | Item | Needed by | Status |
|---|---|---|---|
| 1 | Brevo account, verified sender, API key | M1 (email code sign-in) | pending |
| 2 | Anthropic API key | M2 (AI assists) | key exists; secret not set |
| 3 | Google OAuth consent screen + Gmail scopes + OAuth client | M5 | pending |
| 4 | Microsoft Entra app registration | M5 | pending |
| 5 | Job API keys: Adzuna, Jooble, USAJOBS, Reed | M4 | pending |
| 6 | Apple: Team ID, App Store Connect API key, Developer ID cert, app record | M1 | membership exists; items pending |
| 7 | Windows code signing | before sharing the app | deferred |

---

## 1. Brevo (transactional email for sign-in codes)

1. Sign up at <https://www.brevo.com/> (free plan, no card) and confirm your email.
2. **Verify a sender:** Brevo → *Senders, Domains & Dedicated IPs* → *Senders* → *Add a sender*: name `BruteForceHR`, email you control (e.g. your Gmail). Click the confirmation link Brevo emails you. (No custom domain yet, so DKIM/DMARC for an own domain isn't possible — [ADR 0006](../adr/0006-hosting-domains.md).) API reference: [Create sender](https://developers.brevo.com/reference/create-sender).
3. Activate transactional email if prompted (*Transactional* → *Settings*).
4. **API key:** profile menu → *SMTP & API* → *API Keys* → *Generate a new API key*, name `bruteforcehr-functions`. Copy it once. (Brevo auth: [Send a transactional email — before you start](https://developers.brevo.com/docs/send-a-transactional-email).)
5. Store it:
   ```sh
   firebase functions:secrets:set BREVO_API_KEY
   ```
6. Tell the agent the **sender email + name** (not secret) so it goes into function config (`BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` params).
7. Check: send a sign-in code to yourself after the next functions deploy; it should arrive within 30 s (check Spam the first time).

## 2. Anthropic API key

1. <https://console.anthropic.com/> → *API Keys* → *Create Key*, name `bruteforcehr-functions` (a dedicated key, so it can be revoked alone). Optionally set a monthly spend limit in *Limits*.
2. Store it:
   ```sh
   firebase functions:secrets:set ANTHROPIC_API_KEY
   ```
3. The key is used only server-side; clients never see it ([ADR 0001](../adr/0001-stack.md)).

## 3. Google OAuth (Gmail)

Background: `gmail.readonly` is **restricted** and `gmail.send` is **sensitive** ([Choose Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)). For personal use the app stays **unverified**, published **In production**: in *Testing* refresh tokens expire after 7 days ([OAuth 2.0 — refresh token expiration](https://developers.google.com/identity/protocols/oauth2)). A public launch would need verification plus an annual CASA assessment ([Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)).

1. **Enable the API:** Google Cloud console, project `bruteforcehr` → *APIs & Services* → *Library* → **Gmail API** → *Enable*.
2. **Verify `bruteforcehr.web.app` in Search Console** (needed for the authorized domain, [ADR 0006](../adr/0006-hosting-domains.md)):
   1. <https://search.google.com/search-console> (same Google account that owns the project) → *Add property* → **URL prefix** `https://bruteforcehr.web.app/`.
   2. Choose **HTML file**, download `google<token>.html`, give it to the agent (it goes to `apps/web/public/` and is deployed with Hosting), then click **Verify** ([Verify your site ownership](https://support.google.com/webmasters/answer/9008080?hl=en)).
3. **Branding** (*Google Auth Platform* → *Branding*): app name `BruteForceHR`, support email, logo optional (a logo triggers brand review — skip for now), home page `https://bruteforcehr.web.app/`, privacy policy `https://bruteforcehr.web.app/privacy`, terms `https://bruteforcehr.web.app/terms`, **authorized domain** `bruteforcehr.web.app`, developer contact email.
4. **Audience:** user type **External** → *Publish app* → status **In production**. Do not submit for verification. Users (you) will see "Google hasn't verified this app" → *Advanced* → *Go to BruteForceHR (unsafe)*; unverified apps are capped at 100 users ([OAuth app state overview](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)).
5. **Data access** (scopes): add
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `openid`, `https://www.googleapis.com/auth/userinfo.email`
6. **Client:** *Clients* → *Create client* → type **Web application**, name `bruteforcehr-connect`.
   - Authorized redirect URI: `https://bruteforcehr.web.app/connect/google/callback`
   - Create, copy **Client ID** and **Client secret**.
7. Store:
   ```sh
   firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_ID
   firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_SECRET
   ```

## 4. Microsoft Entra app registration (Outlook / Microsoft 365)

Uses Microsoft Graph delegated `Mail.Read`, `Mail.Send`, `offline_access`, `User.Read`, authority `common` (personal + work/school accounts). Work tenants may require admin consent; publisher verification is needed before distributing to others ([Publisher verification](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)).

1. <https://entra.microsoft.com/> (sign in with a Microsoft account; a personal account gets a default directory) → *Identity* → *Applications* → *App registrations* → *New registration* ([Register an app](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)).
   - Name `BruteForceHR`.
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts** (this is what makes authority `common` work).
   - Redirect URI: platform **Web**, `https://bruteforcehr.web.app/connect/microsoft/callback`.
2. *Overview*: copy **Application (client) ID**.
3. *Certificates & secrets* → *Client secrets* → *New client secret*, description `bruteforcehr-connect`, expiry 24 months (put a calendar reminder 2 weeks before expiry). Copy the **Value** (shown once).
4. *API permissions* → *Add a permission* → *Microsoft Graph* → *Delegated permissions*: `Mail.Read`, `Mail.Send`, `offline_access`, `User.Read` ([Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference)). Remove nothing else needed; no application permissions.
5. *Authentication*: confirm the Web redirect URI; leave implicit grant off.
6. Store:
   ```sh
   firebase functions:secrets:set MS_OAUTH_CLIENT_ID
   firebase functions:secrets:set MS_OAUTH_CLIENT_SECRET
   ```

## 5. Job API keys (M4)

Policy and terms: [ADR 0005](../adr/0005-job-sources-scraping.md). Use one account per source (Adzuna forbids multiple accounts per person).

| Source | Sign-up | Values | Secrets |
|---|---|---|---|
| Adzuna | <https://developer.adzuna.com/signup> | `app_id`, `app_key` (free, instant) | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` |
| Jooble | One key **per country site**: <https://jooble.org/api/about> (US), <https://uk.jooble.org/api/about>, <https://de.jooble.org/api/about>, `nl.jooble.org/api/about`, `tr.jooble.org/api/about` — free plan = 500 requests per key, lifetime ([docs](https://help.jooble.org/en/support/solutions/articles/60001448238-rest-api-documentation)) | key per country | `JOOBLE_KEYS` as JSON, e.g. `{"us":"…","uk":"…","de":"…","nl":"…","tr":"…"}` |
| USAJOBS | <https://developer.usajobs.gov/apirequest/index> — key arrives by email; requests send your email as `User-Agent` ([auth](https://developer.usajobs.gov/Guides/Authentication)) | API key + the email you registered | `USAJOBS_API_KEY`, `USAJOBS_USER_AGENT_EMAIL` |
| Reed | <https://www.reed.co.uk/developers/jobseeker> → "Sign up for a reed.co.uk API Key" | API key (Basic auth username) | `REED_API_KEY` |

```sh
firebase functions:secrets:set ADZUNA_APP_ID
firebase functions:secrets:set ADZUNA_APP_KEY
firebase functions:secrets:set JOOBLE_KEYS --format=json   # or paste the JSON when prompted
firebase functions:secrets:set USAJOBS_API_KEY
firebase functions:secrets:set USAJOBS_USER_AGENT_EMAIL
firebase functions:secrets:set REED_API_KEY
```
If your firebase-tools version has no `--format` flag, run the command without it and paste the one-line JSON.

## 6. Apple (macOS signing/notarization + iOS TestFlight)

1. **Team ID:** <https://developer.apple.com/account> → *Membership details* → *Team ID* (10 chars). GitHub secret `APPLE_TEAM_ID`.
2. **App Store Connect API key** (used for notarization and fastlane uploads; [Creating API keys](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api)):
   1. <https://appstoreconnect.apple.com> → *Users and Access* → *Integrations* → *App Store Connect API* → *Team Keys* → *Generate API Key* (request access first if it's the first key).
   2. Name `bruteforcehr-ci`, access **App Manager**.
   3. Download `AuthKey_<KEYID>.p8` (**only downloadable once**). Note **Key ID** and **Issuer ID** (top of the page).
   4. GitHub secrets: `APPLE_API_KEY` = full contents of the `.p8`; `APPLE_API_KEY_ID`; `APPLE_API_ISSUER`.
3. **Developer ID Application certificate** (macOS distribution outside the App Store):
   1. Keychain Access → *Certificate Assistant* → *Request a Certificate From a Certificate Authority* → save CSR to disk.
   2. <https://developer.apple.com/account/resources/certificates/add> → **Developer ID Application** (G2 Sub-CA) → upload CSR → download `.cer` → double-click to install.
   3. Keychain Access → *My Certificates* → right-click "Developer ID Application: … (TEAMID)" → *Export* → `.p12` with a strong password.
   4. `base64 -i DeveloperID.p12 | pbcopy` → GitHub secret `MAC_CSC_LINK`; password → `MAC_CSC_KEY_PASSWORD`. Delete the exported `.p12` file afterwards.
4. **Bundle ID:** <https://developer.apple.com/account/resources/identifiers/add/bundleId> → App IDs → App → explicit `com.savas07.bruteforcehr`; enable Push Notifications and App Groups (share extension). The share extension ID (e.g. `com.savas07.bruteforcehr.share`) is registered the same way when M4 adds it.
5. **App Store Connect app record:** *Apps* → *+* → *New App*: platform iOS, name `BruteForceHR` (must be unique on the App Store; if taken, use e.g. "BruteForceHR — Job Search"), primary language English (U.S.), bundle ID `com.savas07.bruteforcehr`, SKU `bruteforcehr`, full access.
6. **TestFlight internal group:** app → *TestFlight* → *Internal Testing* → *+* → group `Owner`, add yourself; enable automatic distribution. Install the TestFlight app on the iPhone and turn on Automatic Updates.
7. iOS signing uses the API key with automatic signing (no fastlane match repo) — [ADR 0004](../adr/0004-release-updates-signing.md).

## 7. Windows code signing (later, before sharing)

Currently unsigned by decision ([ADR 0004](../adr/0004-release-updates-signing.md)). Azure Artifact Signing is unavailable to an individual in Turkey (individuals: US/Canada only; organizations: listed countries only — [quickstart prerequisites](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)). When sharing becomes a goal:

1. Buy an **OV code-signing certificate** from a CA that issues to individuals in Turkey and delivers on a **cloud HSM** usable from CI (e.g. via signtool/KSP or PKCS#11). Keys must live on an HSM per CA/B Forum rules.
2. Give the agent: certificate subject (for `publisherName`), CI signing credentials → GitHub secrets (names chosen in the release workflow update).
3. Agent sets `win.sign` + `publisherName` in electron-builder config; the first signed release turns on update signature verification for every installed client.
4. Re-check Artifact Signing eligibility if you register a company in an eligible country.
