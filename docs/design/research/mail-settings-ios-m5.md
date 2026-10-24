# Research addendum (M5, iOS): Settings pages, Connect email (app password), interview suggestions

Status: research complete (M5). Extends [connect-email.md](connect-email.md), [settings-account.md](settings-account.md) and [mail-review.md](mail-review.md) for the iOS surfaces they did not cover. The built design follows these decisions except where the critiques say otherwise (docs/design/critiques/ios/{settings,mail-connect,mail-review-live}).

Scope: iOS surfaces not covered by `docs/design/research/connect-email.md`, `settings-account.md`, `mail-review.md`.
All refs are `platform: ios`. I judged them from the returned preview images. Every call used task_intent "Design a cross-platform job search, CV builder and application tracker app" and output_destination `code`.
Shared rules for every decision below: native SwiftUI `List(.insetGrouped)`, calm copy, amber (`.orange`/custom amber) for warnings, never red-only, every status carries icon + text and never relies on color alone, and every automated action shows its source, a reason and an Undo.

---

## 1. Settings › Job sources — per-source health

Queries: `search_screens` "data sources status list screen showing each integration's health" (deep) + "connected accounts screen with sync error and reconnect" (deep). 16 candidates examined.

| App                    | Screen                          | mobbin_url                                                      | What we borrow                                                                                                        | Why                                                                                         |
| ---------------------- | ------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Google Health (Fitbit) | Connections › Apps and services | https://mobbin.com/screens/9223fb61-1b57-4093-a181-e0c61212829f | Inset-grouped row: icon + name + subtitle "Synced Today, 10:06 PM"; separate "Connected" / "Add connections" sections | Closest match to a native inset List row with last-run time as the secondary line           |
| Structured             | iCloud Sync status              | https://mobbin.com/screens/c350864d-ad8c-4220-baf7-ac13557b52e7 | Status card: icon + "Error while syncing" headline + plain reason line + footer link to help                          | Failing state shows headline + reason + next step in a muted tone, not an alarm banner      |
| Fabric                 | Connected sources               | https://mobbin.com/screens/bfdcac48-e8ff-4d36-afc5-33d23590b132 | Status pill with a dot **and** the word "Active", plus a section explainer line                                       | Status is shown by both shape and text, so color isn't carrying the meaning alone           |
| Tempo                  | Apple Watch connections         | https://mobbin.com/screens/e18d7a87-0f30-4a1f-a947-9e9e1a89cfa4 | Per-row state word in caps under the name ("CONNECTED", "SYNCED", "GRANTED") + trailing check glyph                   | Gives each source one short state word plus a glyph                                         |
| Lloyds Mobile Banking  | Open Banking connected accounts | https://mobbin.com/screens/8d0513bd-a25f-4140-a302-6e66d19e62c2 | Detail metadata: "First connected", "Data last updated on … at …", inline expiry note, FAQ below                      | Source detail sheet: when it last ran, why it's in its current state, and what happens next |

Examined but rejected

- WHOOP — https://mobbin.com/screens/5d76dd8a-b24b-4693-a318-ec4795330d0d — connected vs. not-connected only, no health or time; heavy dark cards.
- Alan — https://mobbin.com/screens/db2661da-07a7-4fba-85f8-8aa47c2d546f — red "Steps" chip uses red for an ordinary state; it's an onboarding explainer, not a status list.
- Noom — https://mobbin.com/screens/1a88b510-c43b-486d-bf9a-3fa74f04d45d — marketing connect list, no per-source status.
- Brave Browser — https://mobbin.com/screens/71d2533b-82e6-4c1c-98c1-e5655d474be4 — debug table with green/grey fills; meaning carried by color only.
- Starling — https://mobbin.com/screens/383ebb2e-560a-4642-bbba-406168f3fedf — every row just says "Connected"; no degraded/failing states.
- Strava — https://mobbin.com/screens/8cd2e29d-258d-43d3-8489-1c8ad542d011 — full-width red "Something went wrong" bar with no reason; too alarming.
- Noom (Can't connect) — https://mobbin.com/screens/2419210e-0800-41b0-b0ce-d45c385858cc — full-screen error with a generic message; we need inline, per-row status.
- Fabric (Connection failed) — https://mobbin.com/screens/0118165d-635d-4fa8-bcae-48836025fdcc — dead-end full screen with a red ×.
- Eight Sleep — https://mobbin.com/screens/bb976239-e92e-4ab6-bc78-d1e5a7e57607 — good numbered recovery steps but dark device context; reused in §6 for help steps only.

**Decision — iOS**

- `List(.insetGrouped)` with sections Working / Needs attention / Skipped. Sort by health so problems come first, but keep the copy calm.
- Row layout: source name, then a secondary line "Last run 2h ago · 148 jobs", following [Google Health](https://mobbin.com/screens/9223fb61-1b57-4093-a181-e0c61212829f). Trailing status label pairs an SF Symbol with a word: `checkmark.circle` OK, `exclamationmark.triangle` Degraded (amber), `xmark.octagon` Failing (amber text with symbol, not red), `minus.circle` Skipped (secondary). Follows [Fabric](https://mobbin.com/screens/bfdcac48-e8ff-4d36-afc5-33d23590b132) and [Tempo](https://mobbin.com/screens/e18d7a87-0f30-4a1f-a947-9e9e1a89cfa4).
- Non-OK rows show the reason in plain words on a third line ("Site changed its layout — we're retrying hourly"), following [Structured](https://mobbin.com/screens/c350864d-ad8c-4220-baf7-ac13557b52e7). Don't show raw error codes.
- Tapping a row pushes a detail view with First added, Last successful run, Last attempt, a reason, and "Run now" / "Pause source", following [Lloyds](https://mobbin.com/screens/8d0513bd-a25f-4140-a302-6e66d19e62c2). Pausing shows a toast with Undo.
- Section footer: "Failures here never delete jobs you've saved." This reassures users and keeps trust.
- Accessibility: the combined label reads "Indeed, degraded, last run 2 hours ago, site changed its layout."

---

## 2. Companies you follow — add by careers URL

Query: `search_screens` "followed companies list screen with add company by URL" (deep). 8 candidates examined.

| App            | Screen                             | mobbin_url                                                      | What we borrow                                                                                                        | Why                                                                               |
| -------------- | ---------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Apple Podcasts | Add Podcast (Follow a show by URL) | https://mobbin.com/screens/2094533c-8255-4096-aeb3-f71dd9eb0362 | Native alert/sheet with one URL field, subtitle "Follow a show by URL", Follow button disabled until the URL is valid | First-party iOS pattern for following by URL; minimal and native                  |
| Brave Browser  | Custom Filter List URL             | https://mobbin.com/screens/1ca2011a-f715-4a1a-a0a6-b89179e5de76 | Inset-grouped form: Cancel / title / Add nav bar, URL keyboard, footer explaining periodic checks and trust           | Matches a SwiftUI `Form` sheet; the footer says what the app will do with the URL |
| Attio          | Add Entry — company picker         | https://mobbin.com/screens/d45fd791-0db1-4544-a6e8-48846a2527b6 | Company row with favicon + name + domain subtitle, trailing count badge                                               | Company list row with domain and a count (our open-jobs count)                    |
| Monarch        | Add Account search                 | https://mobbin.com/screens/a211fb2e-7a45-4a1e-b9f3-5a07d97c241e | Search that matches on name and shows the URL as a subtitle, with a trailing overflow menu                            | Lets users add a company by name _or_ paste a URL in one field                    |
| Matter         | Follow by pasted URL               | https://mobbin.com/screens/ebc910c5-c4a7-44b1-b2db-13be15cb6c21 | Pasting a URL into search resolves it to a domain row with an inline Follow button                                    | Shows the resolved company before following, so there's no blind add              |

Examined but rejected

- Airwallex — https://mobbin.com/screens/4413b30e-2aa9-414d-8e6b-3f87e57eb83a — onboarding multi-URL form with a heavy purple CTA; not a managed list.
- GoFundMe — https://mobbin.com/screens/db9cee80-840a-4910-b02e-b8149d4a49b8 — single-link save with no list or status.
- Shelf — https://mobbin.com/screens/a22d5652-0848-409f-adaf-1a92c4e386de — a people-following social list; tabs and a purple promo don't fit Settings.

**Decision — iOS**

- Settings › Companies you follow is a `List(.insetGrouped)`. Each row shows favicon, company name, careers host as the subtitle (as in [Attio](https://mobbin.com/screens/d45fd791-0db1-4544-a6e8-48846a2527b6)), and a trailing "12 open" count.
- Status is a symbol plus a word in the subtitle: `clock` "Checking…" (pending, secondary), `checkmark.circle` "12 open jobs", `questionmark.circle` "Careers page not found" (amber, with "Edit URL"). It never uses color alone.
- The toolbar "+" opens a sheet `Form` styled like [Brave](https://mobbin.com/screens/1ca2011a-f715-4a1a-a0a6-b89179e5de76) / [Apple Podcasts](https://mobbin.com/screens/2094533c-8255-4096-aeb3-f71dd9eb0362): a URL `TextField` (`.keyboardType(.URL)`, no autocorrect), and Add stays disabled until the URL parses. The footer says "We check this page daily for new roles."
- Before adding, show a resolved preview row (name + host), as [Matter](https://mobbin.com/screens/ebc910c5-c4a7-44b1-b2db-13be15cb6c21) does, so the user confirms the right company.
- Swipe-to-delete removes the company and shows an "Unfollowed Acme · Undo" toast. Saved jobs from that company stay.
- Tapping a "not found" row explains why ("No job listings found at this URL") and offers Edit URL / Remove. The tone stays calm.

---

## 3. Suggested interview from an email — Add interview

Queries: `search_screens` "suggested calendar event detected from an email with add button" (deep) + "email message screen with detected event card and add to calendar button" (deep). 16 candidates examined.

| App         | Screen                             | mobbin_url                                                      | What we borrow                                                                                        | Why                                                                                               |
| ----------- | ---------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Fresha      | Add to calendar sheet              | https://mobbin.com/screens/583cbded-9a47-4d49-981e-b4ffc18c535a | Sheet summary: bold date + time line, address line, then stacked actions                              | Shows the detected event plainly before the user commits                                          |
| Apple Store | Session summary                    | https://mobbin.com/screens/c2d7b97a-ac4c-4d11-a2e2-d9a0dbbaec6b | Date / time range / place stacked text with native tinted "Add to calendar" link-style action         | Calm first-party typographic hierarchy; fits an inset List section                                |
| CVS Health  | Review details — Date and location | https://mobbin.com/screens/c3a9a7d5-a6bb-44a6-a76e-bf9339c78b2e | Icon-led "Where" / "When" rows, each with its own secondary action (Get directions / Add to calendar) | Maps to our When / Time zone / Meeting link rows, each with its own action (Join link, Add)       |
| Polarsteps  | Forward confirmation email         | https://mobbin.com/screens/32abe6cb-424a-4bf4-bb3a-81cb060030d1 | Disclosure footer: "We use an AI model to extract relevant information from your … email"             | Says where the data came from and how it was extracted, which is our "Found in email from …" line |
| Gmail       | Schedule send picker               | https://mobbin.com/screens/a06e5620-2acc-4192-897d-e145434cd02c | Explicit footnote "All times are in Western Indonesia Time"                                           | Showing the time zone explicitly matters for interview times across zones                         |

Examined but rejected

- Saturn Calendar — https://mobbin.com/screens/bb8d47bc-1b9e-4e50-a969-1a31eb8c55e8 — calendar-picker sheet over a dark event card; heavier than we need.
- Luma — https://mobbin.com/screens/2cd0558c-af99-480d-96d1-546d31c2f1c8 — poster-centric, with no detected-field review.
- Beli — https://mobbin.com/screens/3993839e-f7e9-4043-b4ed-4aa9fad138f5 — Gmail sync onboarding with an error toast; not an event card.
- Granola — https://mobbin.com/screens/e7b64e31-32e3-453d-9f54-09687be318e1 — sign-in marketing.
- Flighty (add via email) — https://mobbin.com/screens/894b6a89-a792-407f-8ecb-2d6c58e2de0b — forwarding setup, not detection.
- Flighty (Calendar Sync) — https://mobbin.com/screens/7863eabe-c81e-4daa-846b-27a317728acb — promo card for a feature toggle.
- Apple Invites — https://mobbin.com/screens/2b9e2502-4f31-4a8e-87e2-21b7df8786c3 — suggestion cards for albums and playlists; off-topic.
- Microsoft Outlook — https://mobbin.com/screens/8fe798be-6426-4583-8ca9-05b61bcd2d9a — "Convert to Event" action sheet in compose; not detection.
- Viator — https://mobbin.com/screens/6a486c45-10bc-4a04-9bc1-8c413e485498 — single-button sheet that loses the time zone and link.
- Formula 1 — https://mobbin.com/screens/9241f7d7-14b7-4fac-9937-2616c5f9586c — loud red CTA, but the "My time / Track time" toggle idea is noted.
- GroupMe — https://mobbin.com/screens/9e3a8431-a646-40dc-98ee-ec4f9f4149ff — RSVP chips with emoji; too playful.

**Decision — iOS**

- In the mail-review detail, show a "Suggested interview" inset section above the message body with rows When (`calendar`), Time zone (`globe`), Meeting link (`video`, tappable), and Application (company · role). The structure follows [CVS](https://mobbin.com/screens/c3a9a7d5-a6bb-44a6-a76e-bf9339c78b2e) and [Fresha](https://mobbin.com/screens/583cbded-9a47-4d49-981e-b4ffc18c535a).
- Always show the time zone explicitly ("Tue 4 Nov, 14:00–14:45 CET · 08:00 your time"), following [Gmail](https://mobbin.com/screens/a06e5620-2acc-4192-897d-e145434cd02c). If the zone is ambiguous, show "Time zone not stated — assumed CET" in amber with `exclamationmark.triangle` and an Edit option.
- Section footer gives the source and reason: "Found in Jane Doe's email, 23 Oct · 'Does Tuesday 2pm work?'", following [Polarsteps](https://mobbin.com/screens/32abe6cb-424a-4bf4-bb3a-81cb060030d1).
- Primary action is a `.borderedProminent` "Add interview". Secondary actions are "Edit details" and "Not an interview". Adding shows "Interview added to Acme · Undo" and the stage change is reversible.
- The "Add to Calendar" export (EventKit) is a separate follow-up row _after_ the interview is added, not a forced step. This keeps the action calm, as in [Apple Store](https://mobbin.com/screens/c2d7b97a-ac4c-4d11-a2e2-d9a0dbbaec6b).
- Never auto-add. A detected suggestion stays a suggestion until the user taps.

---

## 4. Notifications — category toggles, quiet hours, OS-permission-off banner

Query: `search_screens` "notification settings screen with system permission turned off banner" (deep). 8 candidates examined.

| App          | Screen               | mobbin_url                                                      | What we borrow                                                                                                                                   | Why                                                                                                        |
| ------------ | -------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Telegram     | Notifications        | https://mobbin.com/screens/24793c63-044a-4396-85aa-dc25d7812bea | Top inset card "Turn ON Notifications" + one-line why + "Turn ON in Settings" link row; categories below as inset-grouped rows with On/Off value | Closest to a native SwiftUI List layout: the banner sits as its own section above the toggles              |
| Google Drive | Notifications        | https://mobbin.com/screens/6b0dbe4d-37d1-4edf-9231-cab69b351931 | Soft tinted banner "Notifications are being delivered quietly" + "Open settings"; toggles stay live underneath                                   | Calm tone, and it covers the _provisional/quiet_ state as well as off                                      |
| Airwallex    | Manage notifications | https://mobbin.com/screens/ec5dbf28-1d5a-4366-ba67-f55163c2bb5b | Info-tinted callout "Push notifications are disabled" + instruction; rows show channel summary "Push, Email"                                     | Neutral info styling (not red), with a per-category channel summary                                        |
| Google Home  | Notifications        | https://mobbin.com/screens/0cf5e996-e2fa-438e-974a-ce57d5ef42dd | Banner text "…turned off in this phone's settings" with `info` icon + single CTA                                                                 | Copy names _where_ notifications were turned off (the phone's settings), so the user doesn't blame the app |
| Spotify      | Notifications        | https://mobbin.com/screens/f3affd56-448d-495d-9bbf-73a4b7ee6e6c | "This device has notifications turned off" card + "Go to Settings"; rows with subtitle "Push, Email"                                             | Confirms the banner-above-list pattern is common across major apps                                         |

Examined but rejected

- Etsy — https://mobbin.com/screens/e139cb91-9e0e-462f-b5b7-95b45400457e — greys out _all_ toggles; the user can't pre-configure, which feels punitive.
- Qantas Airways — https://mobbin.com/screens/c25ef87d-09b7-40e5-885f-b93f69579a00 — the enabled state still shows a red "Go to settings" link; no in-app categories.
- Apple Store — https://mobbin.com/screens/a419e664-8644-4ac0-93b9-a7288cd7edc9 — system prompt over toggles; shows the ask moment, not the off state.

**Decision — iOS**

- First section (only when `UNAuthorizationStatus == .denied`): an inset row with `bell.slash` and the text "Notifications are off in iOS Settings", a secondary line "We'll still show updates inside the app", and a "Open Settings" button (`UIApplication.openNotificationSettingsURLString`). Follows [Telegram](https://mobbin.com/screens/24793c63-044a-4396-85aa-dc25d7812bea) and [Google Home](https://mobbin.com/screens/0cf5e996-e2fa-438e-974a-ce57d5ef42dd). Use an amber/neutral tint, never red.
- Handle `.provisional` with a "Delivered quietly" variant, following [Google Drive](https://mobbin.com/screens/6b0dbe4d-37d1-4edf-9231-cab69b351931). Handle `.notDetermined` with a "Turn on" button that triggers the system prompt.
- Category `Toggle`s (New matching jobs, Application updates, Interview reminders, Recruiter replies, Weekly summary) stay **editable** while OS permission is off, unlike [Etsy](https://mobbin.com/screens/e139cb91-9e0e-462f-b5b7-95b45400457e). Preferences are saved and apply once permission is on.
- Quiet hours section: a Toggle plus two `DatePicker(.hourAndMinute)` rows, with the footer "Interview reminders still come through" (if we choose that) so users trust they won't miss one.
- Each category gets a one-line description, like [Airwallex](https://mobbin.com/screens/ec5dbf28-1d5a-4366-ba67-f55163c2bb5b) / [Spotify](https://mobbin.com/screens/f3affd56-448d-495d-9bbf-73a4b7ee6e6c). Use plain, calm copy and no FOMO wording such as "Don't miss out!".
- Re-check authorization on `scenePhase == .active` so the banner disappears after the user returns from iOS Settings.

---

## 5. Appearance & language

Query: `search_screens` "appearance and language settings screen" (deep). 8 candidates examined.

| App             | Screen                                          | mobbin_url                                                      | What we borrow                                                                                                                                                  | Why                                                                                                  |
| --------------- | ----------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| timespent       | Settings › Display (Theme menu + language menu) | https://mobbin.com/screens/b85487f9-f103-4fd3-bfd7-316f60b5264e | Inset-grouped rows with trailing `Menu` pickers ("Theme System ⌃"); language menu lists "System" first, then languages in their native names                    | Same look as a SwiftUI `Picker(.menu)` in a `Form`; one tap and no push                              |
| Wise            | Language and appearance                         | https://mobbin.com/screens/f49eb4fb-358a-4c11-a574-800a8017a32a | "Same as device — Uses light or dark mode depending on your device settings" as the first option, with an explainer                                             | Makes clear that System is the default, with an explanation                                          |
| Coursera        | Settings — Appearance / Language                | https://mobbin.com/screens/0594a1a8-1409-4898-bff4-b177b265851c | Three-row checkmark list (Dark / Light / Use Device Settings) inside an Appearance section; "Change Preferred Language" opens OS settings (external-link glyph) | Uses the iOS per-app language route (`openSettingsURLString`) instead of a custom in-app i18n switch |
| Coinbase Wallet | Display                                         | https://mobbin.com/screens/cd426b1a-1bd6-4211-8950-41ea951e4fbf | Options with subtitles ("Always use dark mode", "Use your device's default mode") + Language row with trailing value                                            | Each option has a short subtitle so it's clear what it does                                          |
| Base            | Display mode sheet                              | https://mobbin.com/screens/4b9a03c2-00e9-4dde-a771-900c1b1cf276 | Light / Dark / System preview thumbnails                                                                                                                        | Possible later visual enhancement; noted but not for v1                                              |

Examined but rejected

- Revolut — https://mobbin.com/screens/a1ad0765-957d-4cb0-a1a0-4d91a1949a82 — hub that hides the values behind pushes; extra navigation for two settings.
- YouTube Studio — https://mobbin.com/screens/239bcf92-8413-4894-a458-1ec592c9bc6f — bottom-sheet radio list; a non-native control for a `Picker`.
- Bluesky Social — https://mobbin.com/screens/33ba6fd9-3044-43dd-bfa8-c2e88012a2b8 — segmented controls are fine, but font/dim options are out of scope and it's dark-custom styled.

**Decision — iOS**

- Settings › Appearance is one inset section. Row "Appearance" is a `Picker` with `.menu` style showing System / Light / Dark, with System first and default, following [timespent](https://mobbin.com/screens/b85487f9-f103-4fd3-bfd7-316f60b5264e) and [Wise](https://mobbin.com/screens/f49eb4fb-358a-4c11-a574-800a8017a32a). Apply via `.preferredColorScheme` at the root, with `nil` meaning System.
- Section footer: "System follows your iPhone's Light/Dark setting", as in [Coinbase Wallet](https://mobbin.com/screens/cd426b1a-1bd6-4211-8950-41ea951e4fbf).
- Row "Language" shows the current value (e.g. "English") and opens iOS per-app language settings (`UIApplication.openSettingsURLString`), with an `arrow.up.forward` glyph, following [Coursera](https://mobbin.com/screens/0594a1a8-1409-4898-bff4-b177b265851c). This avoids a second, custom i18n path. The footer explains that the app relaunches in the chosen language.
- If we keep an in-app language override for cross-platform parity with desktop/web, list "System" first, then languages by native name (Deutsch, Français, Türkçe), following [timespent](https://mobbin.com/screens/b85487f9-f103-4fd3-bfd7-316f60b5264e).
- No preview thumbnails in v1 ([Base](https://mobbin.com/screens/4b9a03c2-00e9-4dde-a771-900c1b1cf276) noted for later).

---

## 6. Flow — connecting an email account with an app password (IMAP)

Queries: `search_flows` "connecting an email account with app password" + "adding an IMAP email account manually with server settings". 8 unique flows examined.
Gap: no examined iOS flow shows an actual app-password form with per-provider help. OAuth has largely replaced it in major apps. The decisions below therefore combine the closest patterns, plus the numbered-steps screen from §1's examined set.

| App                                 | Flow                               | mobbin_url                                                      | What we borrow                                                                                                                                                                                                                                          | Why                                                                                                             |
| ----------------------------------- | ---------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Apple Mail                          | Adding an account                  | https://mobbin.com/flows/d575603a-9bcf-47d5-b003-bc815e3ad2a2   | Email-first entry ("Enter your email address", then "choose from a list" of providers); provider-specific auth alert explaining _why_ ("Google requires completing authentication in your web browser"); post-connect "Account Added" inset toggle list | Native iOS reference: detect the provider from the address, explain the provider rule, then a confirmation list |
| Shop                                | Connect to a Gmail account         | https://mobbin.com/flows/3d1f4110-721a-44e8-b35d-be4c015a9e03   | Provider picker sheet (Gmail / Outlook rows with "Connect account"), then a pre-consent screen listing what we'll scan and "Disconnect at any time"                                                                                                     | Sets trust before the credential step: what's read, why, and how to undo                                        |
| Microsoft Outlook                   | Accounts (settings)                | https://mobbin.com/flows/f5316032-9f9f-4b19-be84-fda1e9f834e6   | Account detail with "Sync Settings", "Reset Account — Try resetting the account if you have sync issues", and "Remove Account" with a consequence footer                                                                                                | Manage-after-connect surface: reconnect/reset/remove, each with plain copy explaining the consequence           |
| Microsoft Outlook                   | Adding another account             | https://mobbin.com/flows/c3ece351-82b3-4f18-b88c-aa5366b1fd5d   | Single field "Enter your work or personal email" + primary "Add Account" before any password                                                                                                                                                            | Enter the address first so the provider can be detected before showing which help steps apply                   |
| Eight Sleep (screen, supplementary) | My Pod is offline — numbered steps | https://mobbin.com/screens/bb976239-e92e-4ab6-bc78-d1e5a7e57607 | "1. … 2. …" numbered recovery steps with bold step titles + action rows below                                                                                                                                                                           | Pattern for the per-provider "Create an app password" steps                                                     |

Examined but rejected

- Microsoft Outlook — Logging in — https://mobbin.com/flows/e28811be-8941-470d-8989-c4ccd86c362f — the first-party password page in web chrome; no app-password help.
- Redfin — Adding a password — https://mobbin.com/flows/83919b02-cea2-4764-a1e9-c2523da50b37 — account-password setup with a red CTA, not a mailbox connection.
- Opera — Logging in — https://mobbin.com/flows/16f6d882-c958-4adf-81f5-efdecade1bf1 — sync sign-in; generic password field.
- Gmail — Adding another account — https://mobbin.com/flows/edae4e13-ecbb-408b-b44e-a68aa910a63f — Google OAuth web sheet only.
- Gmail — Account options — https://mobbin.com/flows/4db67aef-acc5-42ec-a6c3-44c9f8493b3f — account switcher, off-topic.

**Decision — iOS**

- Step 1 is a sheet `Form` with an Email `TextField` (`.textContentType(.emailAddress)`), following [Outlook](https://mobbin.com/flows/c3ece351-82b3-4f18-b88c-aa5366b1fd5d) / [Apple Mail](https://mobbin.com/flows/d575603a-9bcf-47d5-b003-bc815e3ad2a2). The provider is detected from the domain, with a "Choose provider" fallback row (Gmail, iCloud, Outlook, Yahoo, Fastmail, Other IMAP).
- Before any credential, show a pre-consent section like [Shop](https://mobbin.com/flows/3d1f4110-721a-44e8-b35d-be4c015a9e03): "We only read emails about your applications · Read-only, we never send · Disconnect anytime".
- Step 2 is a provider help section with numbered steps ([Eight Sleep](https://mobbin.com/screens/bb976239-e92e-4ab6-bc78-d1e5a7e57607) style), e.g. Gmail: 1 Turn on 2-Step Verification · 2 Open App passwords (`Link` row with `arrow.up.forward`) · 3 Copy the 16-character password. There's a provider-specific "Why an app password?" line, as in Apple Mail's auth explainer.
- The App password `SecureField` uses `.textContentType(.password)`, ignores spaces on paste, and has a show/hide toggle. "Other IMAP" reveals Host/Port/SSL rows in a collapsed "Server settings" `DisclosureGroup`, prefilled for known providers.
- Connect shows an inline `ProgressView` "Checking connection…". If it fails, show an amber row with `exclamationmark.triangle` and a plain reason ("Gmail rejected the password — app passwords are 16 letters, no spaces"). The fields stay filled, and the user is never bounced back to a full-screen error.
- The success state lists what's synced (Inbox from last 30 days, read-only) with a toggle list, as in Apple Mail's "Account Added". Settings › Email account then follows [Outlook Accounts](https://mobbin.com/flows/f5316032-9f9f-4b19-be84-fda1e9f834e6): Last synced, Reconnect, Disconnect (destructive, with a confirmation footer "Your tracked applications stay; we stop reading new mail").
