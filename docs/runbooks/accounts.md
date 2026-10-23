# Runbook — accounts, keys and secrets the owner must set up

Owner actions that agents can't do (accounts, money, legal). Each section ends with where the value goes. **Never paste secrets into chat, issues, commits or client code.** Runtime secrets go to Secret Manager with `firebase functions:secrets:set` ([Configure your environment — secrets](https://firebase.google.com/docs/functions/config-env)). CI secrets go to GitHub → `Savas07/bruteforcehr` → Settings → Secrets and variables → Actions. The full list of CI secrets, with consumers and rotation, is in [release.md](release.md).

Run `firebase` commands from the repo root (`/Users/savas/Desktop/BruteForceHR`, project `bruteforcehr` from `.firebaserc`). `functions:secrets:set` prompts for the value (paste, Enter) and creates a new secret version; functions pick it up on next deploy.

| #   | Item                                                                            | Needed by                  | Status                                                |
| --- | ------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------- |
| 1   | Sign-in email: none needed (Firebase Authentication email link, no mail vendor) | M1 (sign-in)               | configured 2026-10-23; owner check pending            |
| 2   | Anthropic API key                                                               | M2 (AI import + assists)   | secret set; `cvImport`/`cvAssist` deployed 2026-10-23 |
| 3   | Google OAuth consent screen + Gmail scopes + OAuth client                       | M5                         | pending                                               |
| 4   | Microsoft Entra app registration                                                | M5                         | pending                                               |
| 5   | Job API keys: Adzuna, Jooble, USAJOBS, Reed                                     | M4                         | pending                                               |
| 6   | Apple: Team ID, App Store Connect API key, Developer ID cert, app record        | M1                         | membership exists; items pending                      |
| 7   | Tauri updater signing key                                                       | M1 (first desktop release) | pending                                               |
| 8   | Windows code signing                                                            | before sharing the app     | deferred                                              |

---

## 1. Sign-in email (no account needed)

Sign-in uses Firebase Authentication's email link ([ADR 0008](../adr/0008-auth-email-link.md)); Firebase sends the email from `noreply@bruteforcehr.firebaseapp.com`. There is no mail vendor, API key or secret (owner decision 2026-10-23: no Brevo). The provider, authorized domains, sender name and the `blockPasswordSignUp` blocking function were set up on 2026-10-23.

Owner check, once a build with the new sign-in is installed:

1. In the app, send yourself a sign-in link. It should arrive within a minute; the first time, look in Spam and mark it "Not spam".
2. On a Mac or Windows PC, open the link in the email: the browser shows "Opening BruteForceHR" and asks to open the app; choose Open. On iPhone, the link opens the app directly.
3. Optional: Firebase console → Authentication → Templates shows the sender name `BruteForceHR`. The sign-in email itself has no editable template.

## 2. Anthropic API key

Status 2026-10-23: the secret `ANTHROPIC_API_KEY` exists in Secret Manager. `cvImport` and `cvAssist` (europe-west1) use it. Design, models and limits are in [ADR 0010](../adr/0010-ai.md).

1. <https://console.anthropic.com/> → _API Keys_ → _Create Key_, name `bruteforcehr-functions` (a dedicated key, so you can revoke it on its own). Optionally set a monthly spend limit under _Limits_.
2. Store it, then redeploy so the functions pick up the new version:
   ```sh
   firebase functions:secrets:set ANTHROPIC_API_KEY
   firebase deploy --only functions:default --project bruteforcehr
   ```
   The deploy grants the functions' runtime service account read access to the secret (`roles/secretmanager.secretAccessor`).
3. The key is used only server-side; clients never see it ([ADR 0001](../adr/0001-stack.md)).

**Spend controls**

- Each user can spend at most **$0.50 per UTC day** (`DAILY_COST_CAP_MICRO_USD` in `packages/ai/src/budget.ts`). After that, the apps show "today's AI limit" until midnight UTC. To change the cap, edit the constant and redeploy.
- Spend per user and day: Firestore → `serverOnly/aiUsage/users/{uid}/aiUsageDays/{date}`, field `microUsd` (millionths of a dollar). A TTL policy removes these documents 35 days later. It is declared in `firebase/firestore.indexes.json` and goes live with the next `firestore:indexes` deploy (release CI).
- Logs: Cloud Logging, entries `ai_request` (token counts, cost, outcome; no CV text).
- Each user can turn AI off with `aiEnabled: false` on their profile.

**Checks**

- `ANTHROPIC_API_KEY=… pnpm --filter @bfhr/ai eval` re-runs the live quality eval (about $0.35) and rewrites `packages/ai/eval/report.md`.
- `pnpm --filter @bfhr/functions smoke:ai` calls the deployed callables with a temporary user and deletes it afterwards (about $0.02). It needs `gcloud auth application-default login` as the owner.

## 3. Google OAuth (Gmail)

Background: `gmail.readonly` is **restricted** and `gmail.send` is **sensitive** ([Choose Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)). For personal use the app stays **unverified**, published **In production**: in _Testing_ refresh tokens expire after 7 days ([OAuth 2.0 — refresh token expiration](https://developers.google.com/identity/protocols/oauth2)). A public launch would need verification plus an annual CASA assessment ([Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)).

1. **Enable the API:** Google Cloud console, project `bruteforcehr` → _APIs & Services_ → _Library_ → **Gmail API** → _Enable_.
2. **Verify `bruteforcehr.web.app` in Search Console** (needed for the authorized domain, [ADR 0006](../adr/0006-hosting-domains.md)):
   1. <https://search.google.com/search-console> (same Google account that owns the project) → _Add property_ → **URL prefix** `https://bruteforcehr.web.app/`.
   2. Choose **HTML file**, download `google<token>.html`, give it to the agent (it goes to `apps/web/public/` and is deployed with Hosting), then click **Verify** ([Verify your site ownership](https://support.google.com/webmasters/answer/9008080?hl=en)).
3. **Branding** (_Google Auth Platform_ → _Branding_): app name `BruteForceHR`, support email, logo optional (a logo triggers brand review — skip for now), home page `https://bruteforcehr.web.app/`, privacy policy `https://bruteforcehr.web.app/privacy`, terms `https://bruteforcehr.web.app/terms`, **authorized domain** `bruteforcehr.web.app`, developer contact email.
4. **Audience:** user type **External** → _Publish app_ → status **In production**. Do not submit for verification. Users (you) will see "Google hasn't verified this app" → _Advanced_ → _Go to BruteForceHR (unsafe)_; unverified apps are capped at 100 users ([OAuth app state overview](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)).
5. **Data access** (scopes): add
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `openid`, `https://www.googleapis.com/auth/userinfo.email`
6. **Client:** _Clients_ → _Create client_ → type **Web application**, name `bruteforcehr-connect`.
   - Authorized redirect URI: `https://bruteforcehr.web.app/connect/google/callback`
   - Create, copy **Client ID** and **Client secret**.
7. Store:
   ```sh
   firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_ID
   firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_SECRET
   ```

## 4. Microsoft Entra app registration (Outlook / Microsoft 365)

Uses Microsoft Graph delegated `Mail.Read`, `Mail.Send`, `offline_access`, `User.Read`, authority `common` (personal + work/school accounts). Work tenants may require admin consent; publisher verification is needed before distributing to others ([Publisher verification](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)).

1. <https://entra.microsoft.com/> (sign in with a Microsoft account; a personal account gets a default directory) → _Identity_ → _Applications_ → _App registrations_ → _New registration_ ([Register an app](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)).
   - Name `BruteForceHR`.
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts** (this is what makes authority `common` work).
   - Redirect URI: platform **Web**, `https://bruteforcehr.web.app/connect/microsoft/callback`.
2. _Overview_: copy **Application (client) ID**.
3. _Certificates & secrets_ → _Client secrets_ → _New client secret_, description `bruteforcehr-connect`, expiry 24 months (put a calendar reminder 2 weeks before expiry). Copy the **Value** (shown once).
4. _API permissions_ → _Add a permission_ → _Microsoft Graph_ → _Delegated permissions_: `Mail.Read`, `Mail.Send`, `offline_access`, `User.Read` ([Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference)). Remove nothing else needed; no application permissions.
5. _Authentication_: confirm the Web redirect URI; leave implicit grant off.
6. Store:
   ```sh
   firebase functions:secrets:set MS_OAUTH_CLIENT_ID
   firebase functions:secrets:set MS_OAUTH_CLIENT_SECRET
   ```

## 5. Job API keys (M4)

Policy and terms: [ADR 0005](../adr/0005-job-sources-scraping.md). Use one account per source (Adzuna forbids multiple accounts per person).

| Source  | Sign-up                                                                                                                                                                                                                                                                                                                                       | Values                              | Secrets                                                                      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| Adzuna  | <https://developer.adzuna.com/signup>                                                                                                                                                                                                                                                                                                         | `app_id`, `app_key` (free, instant) | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`                                            |
| Jooble  | One key **per country site**: <https://jooble.org/api/about> (US), <https://uk.jooble.org/api/about>, <https://de.jooble.org/api/about>, `nl.jooble.org/api/about`, `tr.jooble.org/api/about` — free plan = 500 requests per key, lifetime ([docs](https://help.jooble.org/en/support/solutions/articles/60001448238-rest-api-documentation)) | key per country                     | `JOOBLE_KEYS` as JSON, e.g. `{"us":"…","uk":"…","de":"…","nl":"…","tr":"…"}` |
| USAJOBS | <https://developer.usajobs.gov/apirequest/index> — key arrives by email; requests send your email as `User-Agent` ([auth](https://developer.usajobs.gov/Guides/Authentication))                                                                                                                                                               | API key + the email you registered  | `USAJOBS_API_KEY`, `USAJOBS_USER_AGENT_EMAIL`                                |
| Reed    | <https://www.reed.co.uk/developers/jobseeker> → "Sign up for a reed.co.uk API Key"                                                                                                                                                                                                                                                            | API key (Basic auth username)       | `REED_API_KEY`                                                               |

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

1. **Team ID:** <https://developer.apple.com/account> → _Membership details_ → _Team ID_ (10 characters). GitHub secret `APPLE_TEAM_ID`.
2. **App Store Connect API key** (used by Tauri for notarization and by `xcodebuild` for cloud signing + TestFlight upload; [Creating API keys](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api)):
   1. <https://appstoreconnect.apple.com> → _Users and Access_ → _Integrations_ → _App Store Connect API_ → _Team Keys_ → _Generate API Key_ (request access first if it's the first key).
   2. Name `bruteforcehr-ci`, access **Admin**. Cloud-managed distribution certificates are "accessible only to members of your development team with the Admin role" ([Xcode 13 release notes](https://developer.apple.com/documentation/xcode-release-notes/xcode-13-release-notes)), and the iOS job signs with them ([ADR 0004](../adr/0004-release-updates-signing.md)).
   3. Download `AuthKey_<KEYID>.p8`. It's **only downloadable once**. Note the **Key ID** and the **Issuer ID** (top of the page).
   4. GitHub secrets: `APPLE_API_KEY_P8` = full contents of the `.p8`; `APPLE_API_KEY_ID`; `APPLE_API_ISSUER`. (CI writes the `.p8` to a temp file and passes its path as `APPLE_API_KEY_PATH`, and the Key ID as `APPLE_API_KEY`, which are the variable names Tauri expects — [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/).)
3. **Developer ID Application certificate** (macOS distribution outside the App Store):
   1. Keychain Access → _Certificate Assistant_ → _Request a Certificate From a Certificate Authority_ → save the CSR to disk ([Create a CSR](https://developer.apple.com/help/account/create-certificates/create-a-certificate-signing-request)).
   2. <https://developer.apple.com/account/resources/certificates/add> → **Developer ID Application** (G2 Sub-CA) → upload the CSR → download the `.cer` → double-click to install.
   3. Keychain Access → _My Certificates_ → right-click "Developer ID Application: … (TEAMID)" → _Export_ → `.p12` with a strong password.
   4. `openssl base64 -A -in DeveloperID.p12 | pbcopy` → GitHub secret `APPLE_CERTIFICATE`; the password → `APPLE_CERTIFICATE_PASSWORD`; the exact identity string (`security find-identity -v -p codesigning`, e.g. `Developer ID Application: Name (TEAMID)`) → `APPLE_SIGNING_IDENTITY`. Tauri imports the certificate into a temporary keychain itself ([Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/)). Delete the exported `.p12` file afterwards.
4. **Bundle ID:** <https://developer.apple.com/account/resources/identifiers/add/bundleId> → App IDs → App → explicit `com.savas07.bruteforcehr`; enable Push Notifications and App Groups (share extension). The share extension ID (e.g. `com.savas07.bruteforcehr.share`) is registered the same way when M4 adds it. The Tauri desktop app uses the same identifier on macOS (Developer ID distribution, not the Mac App Store).
5. **App Store Connect app record:** _Apps_ → _+_ → _New App_: platform iOS, name `BruteForceHR` (must be unique on the App Store; if taken, use e.g. "BruteForceHR — Job Search"), primary language English (U.S.), bundle ID `com.savas07.bruteforcehr`, SKU `bruteforcehr`, full access.
6. **TestFlight internal group:** app → _TestFlight_ → _Internal Testing_ → _+_ → group `Owner`, add yourself, enable automatic distribution. Install the TestFlight app on the iPhone and turn on Automatic Updates.
7. iOS signing uses the API key with automatic cloud signing (`xcodebuild -allowProvisioningUpdates -authenticationKey…`). There's no fastlane, no match repo and no distribution `.p12` for iOS ([ADR 0004](../adr/0004-release-updates-signing.md)).

## 7. Tauri updater signing key (desktop auto-update)

The desktop updater only installs bundles signed with this key, and that check "cannot be disabled" ([Tauri updater](https://v2.tauri.app/plugin/updater/)). It is also the only update-integrity check for the unsigned Windows build. **If the private key is lost, installed apps can't receive updates any more**, so keep an offline backup.

1. Generate the key pair on your Mac with a strong password (after `apps/desktop` exists; [CLI `signer generate`](https://v2.tauri.app/reference/cli/)):
   ```sh
   cd /Users/savas/Desktop/BruteForceHR
   pnpm --filter @bfhr/desktop exec tauri signer generate -w ~/.tauri/bruteforcehr.key
   ```
   It prompts for the password and writes `~/.tauri/bruteforcehr.key` (private) and `~/.tauri/bruteforcehr.key.pub` (public).
2. GitHub secrets: `TAURI_SIGNING_PRIVATE_KEY` = full contents of `~/.tauri/bruteforcehr.key`; `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = the password. (`.env` files don't work for these — [Tauri updater](https://v2.tauri.app/plugin/updater/).)
3. Give the agent the **public key** (contents of `bruteforcehr.key.pub`; not secret). It goes into `apps/desktop/src-tauri/tauri.conf.json` → `plugins.updater.pubkey`, which must contain the key itself, not a file path.
4. Back up the private key file and the password in two separate places you control (e.g. password manager + encrypted offline drive). Then delete `~/.tauri/bruteforcehr.key` from the Mac if you don't sign locally.
5. Never regenerate the key for an existing install base. Rotating it means shipping one release signed with the old key that carries the new public key ([ADR 0004](../adr/0004-release-updates-signing.md)).

## 8. Windows code signing (later, before sharing)

Currently unsigned by decision ([ADR 0004](../adr/0004-release-updates-signing.md)). Updates are still verified by the Tauri updater signature (section 7). Azure Artifact Signing is unavailable to an individual in Turkey (individuals: US/Canada only; organizations: listed countries only — [quickstart prerequisites](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)). When sharing becomes a goal:

1. Buy an **OV code-signing certificate** from a CA that issues to individuals in Turkey and delivers on a **cloud HSM** usable from CI (e.g. via signtool/KSP or PKCS#11). Keys must live on an HSM per CA/B Forum rules.
2. Give the agent the CI signing credentials → GitHub secrets (names chosen in the release workflow update).
3. The agent sets `bundle.windows.signCommand` (cloud HSM / Key Vault tools) or `certificateThumbprint` in `tauri.conf.json` ([Tauri Windows code signing](https://v2.tauri.app/distribute/sign/windows/)). The updater signature stays as it is.
4. Re-check Artifact Signing eligibility if you register a company in an eligible country.
