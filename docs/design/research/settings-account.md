# Settings, export and account deletion: design research

Research date: 2026-10-22. Sources: Mobbin MCP `search_screens` and `search_flows`. Every call used `task_intent` "Design a cross-platform job search, CV builder and application tracker app" and `output_destination: "code"`. The user's saved Mobbin collections contain only website sections (see kickoff), so none apply to this area. I judged every reference from its screenshots. No images are committed; open the `mobbin_url` to view.

## Scope

Brief §5.3 row **Settings, export, account deletion**. The content requirements come from §4.9 and §8.

| Platform | Matrix entry | Queries run (mode) | Examined | Kept |
|---|---|---|---|---|
| iOS | settings | "settings screen"; "settings menu screen with profile header and grouped sections"; "connected accounts screen listing linked services with status"; "notification settings screen with quiet hours" (all standard, `search_screens`) | 27 | 14 |
| iOS | delete account flow | "delete account" (`search_flows`) | 6 flows | 3 |
| iOS | data export (brief §4.9 "Export everything") | "exporting personal data" (`search_flows`) | 6 flows | 4 |
| Desktop (`web`) | settings (shell, mail accounts, API keys, notifications + quiet hours, account deletion, update channel, export) | "settings page with section navigation sidebar"; "connected accounts settings page with connect and disconnect for each service"; "API keys settings page"; "notification settings page with quiet hours schedule"; "delete account confirmation dialog"; "app update settings with beta channel and check for updates"; "export all data settings section" (all standard) | 48 | 22 |

Requirements covered:

- **Mail accounts.** Connect, re-auth, and disconnect + purge data. The connect flow itself belongs to the "Connect email account / permissions" research row. This doc covers the management screens and links into that flow.
- **Job sources** and their API keys. Keyless sources: Remotive, Arbeitnow and the ATS boards. Keyed sources the user registers: Adzuna, Jooble, USAJOBS, Reed (kickoff).
- **AI.** Provider and key, the AI toggle (§8), and "Allow sending email text to AI".
- **Notifications** and quiet hours.
- **Desktop.** Launch at login, menu bar / tray mode (opt-in), update channel (stable/beta), and "Check for updates".
- **Export everything** as a ZIP (JSON + files).
- **Delete account.** Hard delete, including Storage and token revocation. The job-mail retention window (§8, default 180 days, configurable) also lives here.

## References

### iOS: settings

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Monzo | Settings root | https://mobbin.com/screens/6b891ec1-ab93-464c-b98d-0fef1c262968 | Inset-grouped root with a personal-details row on top, a short Privacy / Notifications / Legal group, "Close account" in its own group, "Log out" as plain tinted text, and the app version + build as a footer. | A calm, short root. The destructive and exit actions are spatially separated from everyday settings, and the version footer gives support a reference. |
| Telegram | Settings root with icon tiles and trailing values | https://mobbin.com/screens/d1dbed8c-9d7f-410e-943f-91d0268bb2de | Colored SF-symbol tiles, trailing value text ("Off", "English"), and an attention badge on the one row that needs action ("Notifications and Sounds ⓘ"). | This is the iOS Settings grammar users already know. The single badge is how "Mail accounts · needs attention" surfaces without a banner. |
| ChatGPT | Settings sheet opened from the avatar | https://mobbin.com/screens/cb1e2e78-a7f7-4e76-a1e2-67d509361235 | A modal sheet with a close button, the identity header (name, handle) on top, and an "Account" group whose first row shows the email as a two-line value. | §4.1 says settings open from the avatar. A sheet keeps the tab context underneath, and the email row shows which address signs in. |
| MacroFactor | "More" root with General → Account / Integrations | https://mobbin.com/screens/3aedad23-65c2-4409-840b-406e1940c22a | An "Integrations" row in the first group, next to Account. | Mail accounts and Job sources are our integrations. They belong high in the list, because the app's value depends on them. |
| Family | Preferences with icon + toggle + explanatory paragraph | https://mobbin.com/screens/032a9503-5994-4aae-a650-cbb800a71952 | Each consequential toggle has a one-sentence explanation of what changes ("Spam tokens… will automatically be moved…"). | "Allow sending email text to AI" needs exactly this: what is sent, and what happens when it's off. |
| Depop | Preferences with footnotes under toggles and "Notification preferences" sub-group | https://mobbin.com/screens/cf5126f5-dc7f-4d9a-b793-0b46dd3fe86c | Section headers in sentence case, a footnote below the toggle (`List` footer text), and push / email preferences as chevron rows. | Native `Section` footers are the right place for explanations. They stay accessible and scale with Dynamic Type. |
| Finch | Preferences inset list mixing value rows, toggles and chevrons | https://mobbin.com/screens/91b90ef0-e7e7-4628-9099-85b10f560668 | Value rows ("Mood check-in content · Affirmation ›"), subtitle rows and toggles all in one card. Muted-content rows are chevrons. | Shows how to mix row types without visual noise. "Decisions" (rejections) can be muted the same way. |
| Mesh | Integrations with "Connected" section and per-row menu "Synced 3 days ago · Disconnect · Sync Again" | https://mobbin.com/screens/bdbb9c4b-d4cd-464f-85c4-df1c9ed52fa0 | A "Connected integrations" section above "All integrations". The row menu shows the last sync time as a header, then the actions. | This is the Mail accounts list: connected addresses on top with last-checked time, a "Check now" action, and Disconnect. |
| Google Health (Fitbit) | Connections: "Connected" card "Synced Today, 10:06 PM" + "Add connections" | https://mobbin.com/screens/9223fb61-1b57-4093-a181-e0c61212829f | Connected services show a sync timestamp as their subtitle. Services you can add have a one-line description of what they unlock. | It's the model for Job sources: each keyed source says what it adds ("UK jobs from Reed") before asking for a key. |
| Uber Eats | Connected social apps with "Connect" / "Disconnect" pills + login activity | https://mobbin.com/screens/25c847a2-84e2-4e0a-85c7-d696714f89d3 | Connect / Disconnect as neutral secondary pills (not red), under an explanatory heading. | Disconnect is reached calmly. The consequence explanation lives in the confirmation, not in alarming row styling. |
| Linear Mobile | Notifications: push toggle, "Notification schedule", day chips, From / To, time zone, "System notification settings ↗" | https://mobbin.com/screens/cf837439-e9bf-410c-bfd3-7e3ec2e98e95 | A compact quiet-hours editor: schedule toggle → day chips → From / To time pills → time-zone label. A link out to iOS system settings. | It covers the whole quiet-hours requirement on one screen with native controls. The system-settings link handles denied permission. |
| Instagram | Sleep mode: start / end times, day chips, summary sentence | https://mobbin.com/screens/2ccc1ca1-a019-47b8-9afa-4b00c5237bdd | A plain-language summary under the day picker ("Sleep mode is on Monday, Tuesday… and Friday"). | Day chips alone are hard to read with VoiceOver and in TR/DE. A generated sentence confirms the choice. We drop its explicit Save button (see rejected). |
| Microsoft Outlook | Do Not Disturb: timed + scheduled options with footnote | https://mobbin.com/screens/51cfb32e-0520-4dff-a88f-ef94f1da8d0b | A "Timed" group (Until I turn it off / 1 hour / Until tomorrow) separate from "Scheduled" (work hours with the range as subtitle "Weekdays · 8 AM to 5 PM"). | One-off "pause" is different from recurring quiet hours. The subtitle shows the range without opening the row. |
| Asana | Do not disturb: Schedule toggle, From / To, Days off, explanatory footers | https://mobbin.com/screens/6becc4af-9dd6-408f-8102-01edc32630ea | Footers that state the effect in plain words ("Asana won't send push notifications during scheduled times"). | This is the wording model for quiet hours: say what we won't do, not what the switch is called. |

### iOS: delete account flow

| App | Flow | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Vestiaire Collective | Personal info → "Delete account?" sheet → app restarts at splash | https://mobbin.com/flows/1d82d598-a76f-4b01-af48-ae0af8101148 | A sheet that names what is lost ("saved content, order history and listings"), an outlined destructive button, a plain "Cancel", and a hard reset to the app's first screen afterwards. | The final step is short and honest. After deletion the app is back to a clean, signed-out state. |
| Discord | Account → "Account Management" group (Disable / Delete in red) → verification prompt → welcome screen | https://mobbin.com/flows/884ad9f2-ab94-45ae-bed4-37a3c0d6568a | Deletion sits at the bottom of the account page in its own labeled group. A verification step must be completed before deletion. | We have no passwords, so the verification step becomes a fresh email code. That reuses the sign-in OTP component and proves it's really the user. |
| Starbucks | Account → "Delete account" dedicated screen | https://mobbin.com/flows/69699f6c-c1c2-4749-85df-ac428ff2e2a5 | A full screen of its own that explains the consequences in specific terms (what will be returned, what is unrecoverable) with a single destructive action. | A dedicated screen gives room for the itemized list and an "Export first" option. We do **not** take its "We'll be sad to see you go" line (guilt). |

### iOS: data export

| App | Flow | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| MacroFactor | More → "Data Management" (Data Export / Data Visibility / Account & Data Deletion) → export with progress in the button | https://mobbin.com/flows/d3292b3c-def7-4a2d-b21b-4e94010323d2 | A "Data Management" group that holds export, privacy and deletion together. The export button shows a spinner in place while the file is built. | Grouping export and deletion under one heading makes them easy to find. The inline progress avoids a blocking modal. |
| Character AI | Settings → Data & Privacy → Export data → inline success card | https://mobbin.com/flows/2a112e02-6d1a-4726-b95b-74998fc42a33 | A short "Data & Privacy" page (Export data, Terms ↗, Privacy policy ↗). After the request, an inline success card appears above the row explaining how the file will arrive. | Confirmation stays in place (no alert) and says what happens next. |
| Binance | Privacy Center (Download / Rectify / Delete) → export form → timestamped confirmation banner | https://mobbin.com/flows/1627ac50-8270-4d42-bf44-ddaa1d5f9a47 | A "Privacy Center" list that names each data right. The confirmation banner includes the exact request time and how long it takes ("up to 20 minutes"). | Giving a time estimate keeps waiting calm, and the timestamp helps if the export is slow. |
| Hinge | Settings → Download My Data → "You're all set!" with what's not included + a warning about deleting before retrieving | https://mobbin.com/flows/6f1580d8-37f6-4b24-9b11-b91177d8a2c7 | It states what the export does **not** contain and warns that deleting the account before downloading loses the export. | Our export excludes secrets and non-job mail (never stored, §8). The delete screen needs the "export first" warning. |

### Desktop (`web`): settings shell

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Microsoft Teams | Settings with left category list and row cards (label + helper + control, "On / Off" text beside switches) | https://mobbin.com/screens/f6904629-5f3e-4ce0-9fff-a2524964b383 | Left category nav (General, Notifications and activity, Accounts and orgs, Privacy…). Each setting is a row with a title, a helper line and a right-aligned control. Switches carry a visible "On" / "Off" label. | It's a desktop-native settings layout that also feels right on Windows. The text state label helps color-blind users and screen-reader parity. |
| Ghost | Settings index with search (`/` shortcut) and grouped headings | https://mobbin.com/screens/e3a69991-68a8-4be8-b703-f8a70eb0d010 | A searchable settings index with a visible `/` shortcut. Grouped headings (General / Site / Membership) and a "← Done" exit. | Keyboard-first: `/` searches settings, and the same index feeds the ⌘K palette. |
| Google Drive | Settings with short section list and headed groups | https://mobbin.com/screens/018d0358-d0f8-43d9-9a34-490c677f273b | A very short left nav (General, Privacy, Notifications, Manage apps) and plain group headings with a single control each. | Restraint: settings stay short when each page has a few clearly titled groups. |
| Twenty | Settings with nested "Accounts → Emails / Calendars" and an "Updates" page (changelog + Early access) | https://mobbin.com/screens/07d13b73-c275-4a0d-a675-ed90207aa178 | A nested nav item for connected accounts, and an **Updates** page combining "Read changelog" with an early-access toggle that has an honest caveat ("Please bear with us and report any issues"). "Exit Settings" at the top. | This is the closest match to our Updates page (changelog + beta channel) and to nesting Mail accounts under Connections. |

### Desktop (`web`): mail accounts (connections)

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Adobe Express | Connections dialog: per-provider card with status icon, identity, Connect, overflow `…` | https://mobbin.com/screens/ad4ab82a-1d7f-4b4c-9f06-41be58254e99 | Each account is a card: provider logo + name, a status line with an icon ("✓ Connected" + avatar / "⊗ Not connected"), a primary Connect button and an overflow menu for less common actions. "Add new" sits under each provider. | Status uses an icon plus text, not color alone. Reconnect, Check now and Disconnect go in the overflow, so the card stays calm. |
| Salesforce | Email and Calendar Accounts: info banner + connected row with "Disconnect" and "Delete" | https://mobbin.com/screens/e213cdd5-5b27-4fb5-9c84-88a610ed9f9f | An info banner explaining what connecting does, a "Your Connection" chip, and separate Disconnect and Delete actions. | The banner is where we state what we read and keep (job mail only, §8). The Disconnect/Delete split informed our decision to make purge part of disconnect (see Decision). |
| Podia | "Disconnect Zoom?" dialog with consequences and "Remain connected" safe button | https://mobbin.com/screens/69f9ab92-84ac-4663-87af-d33583e12b99 | The confirmation states the concrete effect. The cancel button is worded as the safe choice ("Remain connected"), not a generic "Cancel". | "Keep connected" is clearer than "Cancel" in a destructive dialog and translates better. |

### Desktop (`web`): job source API keys

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| ElevenLabs | API Keys table: name, masked key (`••••d8af`), created, Enabled switch, overflow | https://mobbin.com/screens/6739c2c6-13ee-455c-b1a4-90933c2ffece | The key is shown only as a masked tail, with an enable switch per key and a short paragraph explaining what a key is. | We never show a stored key again (server-only secret). The last 4 characters are enough to recognize it. The switch pauses a source without deleting its key. |
| incident.io | API key card with "Last used: never" and a list of what it can do | https://mobbin.com/screens/72f5118f-c0e2-497a-b53a-37d9954fed5c | "Last used" metadata on each key, plus a plain list of what the key allows. | "Last used 2 h ago · 140 jobs found" tells the user the key works without revealing it. A failure shows up as "Last error". |
| Buffer | API page: empty card "Create a Personal Key" + "API Docs" / "Help Center" header links; grouped settings nav (Account / Organization / Features / Other) | https://mobbin.com/screens/796d3feb-5dd5-480b-a26f-27b0a398b685 | The empty state is a card with one-sentence value + one button, with docs links in the header. The settings nav is grouped under small headings. | Each keyed source without a key shows "Add your free Adzuna key" with "Get a key ↗" as the docs link. |

### Desktop (`web`): notifications + quiet hours

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Slack | Preferences → Notification schedule: "Weekdays ▾ 8:00 AM to 6:00 PM" + consequence line | https://mobbin.com/screens/45df3d90-3518-44e7-9b17-e57cdbc84476 | One sentence-shaped row of controls (day preset ▾, from ▾, to ▾) followed by a line saying what that means ("You won't receive notifications on Saturday or Sunday"). | Sentence-shaped controls read naturally and the consequence line removes doubt. |
| Basecamp | "When?" with "Work Can Wait! Only during my work hours…", day toggles, and "Catch me up if anything happened after hours" | https://mobbin.com/screens/8ed81d9c-8f10-43bf-8425-4240828dcbdf | A **catch-up summary** option: notifications held during quiet hours are summarized once quiet hours end. | Quiet hours shouldn't mean missing an interview invite. One summary at 08:00 respects both rest and the job search. |
| Vanta | Schedule: "Anytime" vs "Every day between 9am and 6pm in GMT+8 Asia/Singapore" | https://mobbin.com/screens/40b8d343-9f16-4fd0-8a4a-6ea6dcf5e882 | Radio choice between "Anytime" and a scheduled window, with the **time zone named** in the row. | Users relocating (EU / UK / US / remote) move between time zones. Quiet hours must say which zone they follow. |
| Asana | Do not disturb: "Notifications paused until Sunday at 12:00am · Resume notifications" | https://mobbin.com/screens/426ad7e9-6572-4ad4-afbd-e4f4ee052ae2 | When quiet hours (or a manual pause) are active, the top of the section states it and offers "Resume" immediately. | The current state is visible and reversible in one click. |

### Desktop (`web`): account deletion

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Lovable | "Delete your account" dialog: "This will permanently delete:" itemized list | https://mobbin.com/screens/bb0d45db-e185-4882-9463-4c511e00eca6 | An itemized, specific list of what goes away, in a tinted box at the top of the dialog. | Specific beats vague ("all your data"). The user knows exactly what happens to CVs, applications and mail data. Its reason survey is rejected (see below). |
| Render | "Delete Render Account": consequences, "can NOT be reversed", type-to-confirm with the delete button disabled until valid | https://mobbin.com/screens/48cfcd64-811a-4f14-805e-9b4a9d23ed16 | The destructive button stays disabled until the verification input is valid. The deletion entry is at the very bottom of settings. | The same disabled-until-valid rule applies to our email-code field. |
| Fireflies | Two-column dialog: "Deleting account means… you'll lose access to" list + "Don't Delete" / "Delete Account" | https://mobbin.com/screens/4ffcfa10-79ee-4e28-b2f3-93f54290c66d | The safe button ("Don't Delete") comes first and is the default focus. The destructive button is a tinted secondary, not a loud fill. | Escape and Enter must never delete by accident. The default focus goes to the safe action. |

### Desktop (`web`): updates

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Twenty | Updates page (see Settings shell) | https://mobbin.com/screens/07d13b73-c275-4a0d-a675-ed90207aa178 | A changelog row plus an early-access (beta) opt-in with an honest caveat. | Channel switching plus a link to the changelog on one page. |
| Buffer | Beta Features with toast "Organization added to beta program · It may take a couple of minutes… · Reload Now" | https://mobbin.com/screens/ec32cdce-affc-4901-b0a4-d25e75008e9b | After opting in, a toast explains the delay and offers the follow-up action ("Reload Now"). | This maps to "Version 1.5.0 is ready · Restart to update" after a channel switch or a manual check. |
| Clerk | Updates: "1 new update available" card with an "Updated" chip, info line and expandable details | https://mobbin.com/screens/0d334b51-f362-45b1-a6a5-6c2cb42abac3 | The update status is a card with a status chip, a one-line explanation and collapsible details. | The update status block shows Up to date / Downloading 45 % / Ready to install with "What's new" collapsed. |

### Desktop (`web`): export

| App | Screen | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Slack | Export Data: "Here's what's included" / "What's not included", Past Exports table with "Ready for download", retention note | https://mobbin.com/screens/39ac1255-c831-4fb1-b54c-6b376fc648b4 | A two-column included / not-included list and a past-exports table with status and a note on how long files stay available. | It's honest about scope (secrets and non-job mail are not included) and shows export status without email round-trips. |
| Trello | Export: single "Create new export" + ZIP description | https://mobbin.com/screens/379194bd-3ca1-48be-b3bb-834389880109 | One primary button, with the format described in one sentence ("ZIP… CSV and JSON… attachments in their native format"). | Matches §4.9 "ZIP (JSON + files)" one-to-one. No options are needed in v1. |
| beehiiv | Recent Exports table: date, type, "completed" chip, Download link | https://mobbin.com/screens/82fd6355-3f3e-47aa-b15b-6fc56553850c | A compact table of recent exports with a status chip and a download link. | The desktop variant of the past-exports list. Downloading uses the native save dialog. |

## Examined but rejected

| App | `mobbin_url` | Reason |
|---|---|---|
| Whatnot (iOS preferences) | https://mobbin.com/screens/a56b03f3-4237-468c-b913-8f2b0cc29c23 | Every toggle sits in its own large card with a paragraph. Too long to scan. |
| Marriott Bonvoy (iOS preferences) | https://mobbin.com/screens/b270049f-13ba-468e-82f5-6d9870389c66 | A "Save Preferences" button for toggles. iOS settings apply immediately, and an explicit save invites lost changes. |
| Peloton (iOS preferences) | https://mobbin.com/screens/8105e3db-815d-46d3-806e-54f5f645d1f0 | Red all-caps "EDIT" links and an inline wheel picker. Non-native and alarming. |
| Zalando (iOS preferences) | https://mobbin.com/screens/e5c1ce52-72dd-4a70-ae89-0f57ae6f4c20 | A marketing hero illustration on a settings page. Settings should be quiet. |
| Jomo (iOS settings) | https://mobbin.com/screens/ecb928b5-6d8c-4677-9604-9ea5242a3525 | A plan / upsell card and a colored help banner dominate the top. We have no plans to sell. |
| Comet (iOS settings) | https://mobbin.com/screens/295cd228-f9c0-4c61-a851-2d95ce39ec5c | Browser-specific groups (default browser, bookmarks). Too many top-level groups. |
| Vocabulary (iOS settings) | https://mobbin.com/screens/8d78b587-21e3-451d-8187-4a98dfb85408 | Decorative illustrated icons and personal attributes (gender, age) mixed into settings. |
| Xbox (iOS linked accounts) | https://mobbin.com/screens/950b0044-1ff7-4937-8360-533e69e8cd98 | Dark all-caps "LINK" text buttons with no status or identity shown. |
| Shelf (iOS connections) | https://mobbin.com/screens/5fe23a6f-dec7-435f-86cc-ab8fdb10dcc5 | Social follow links mixed with data connections. The two kinds aren't distinguished. |
| Live Nation (iOS linked accounts) | https://mobbin.com/screens/311be3b5-63ca-4484-bded-38b9ca3c292f | A red "Connect" and a bare "Connected" label. Red for a positive action, and no way to manage a connection. |
| Grok (iOS connectors) | https://mobbin.com/screens/874caaa3-fdfd-4ce2-a8b0-51358237dcb9 | A grey "Added" pill that looks disabled. Status and action are ambiguous. |
| GitHub (iOS working hours) | https://mobbin.com/screens/400faca6-a0af-4b97-8050-72f504d43c83 | A floating wheel picker covering the day list. Linear's time pills are clearer. |
| Slack (iOS pause notifications) | https://mobbin.com/screens/fcec9b98-df68-459e-8eda-0c48d5887377 | Only a one-off pause plus a large date wheel. No recurring schedule. |
| Zomato (iOS delete flow) | https://mobbin.com/flows/f3c15491-a02c-412a-9d24-83cc394ed972 | A mandatory "Why would you like to delete…" step before deletion. Friction with no benefit for the user. |
| Tonal (iOS delete flow) | https://mobbin.com/flows/3499e547-3c38-474c-9676-7f64e33c28a5 | A tiny red all-caps link and a support phone number. It looks like the deletion is being discouraged. |
| Forest (iOS delete flow) | https://mobbin.com/flows/d487e001-8070-44ab-b913-b433e05a2d29 | The deletion button is disabled until a reason is ticked. A forced survey. |
| SHEIN (iOS export flow) | https://mobbin.com/flows/c1184e00-77d9-42cd-82f5-8efc8d0784c9 | All-caps legal paragraph and a modal "OK" with no time estimate. |
| GroupMe (iOS export flow) | https://mobbin.com/flows/ffd6ea99-921c-4011-8519-cc2650f4efc7 | "Export" sends the user to a web help article. A full-width red delete button sits right under export. |
| GitBook (web settings) | https://mobbin.com/screens/5e25f82f-e668-4a52-8a81-eab81441a987 | A site-structure editor inside settings. Far too complex for this area. |
| beehiiv (web settings nav) | https://mobbin.com/screens/704dcfea-b99c-4278-b7b2-4cb0e4c74e3f | Every nav item is a bordered card. Heavy and slow to scan. |
| Plain (web settings) | https://mobbin.com/screens/4d19fd1b-6159-4cbb-a36d-fa4c3a5fdd77 | A form with a Save button per card and code text areas. Built for admins. |
| Teachable (web settings) | https://mobbin.com/screens/9c100494-356e-470f-bc43-9a7d7caa63e8 | Table-shaped settings (Setting / Description / control columns). Dense and hard to localize. |
| Patreon (web connect socials) | https://mobbin.com/screens/7313cc61-4f82-44b9-9cc5-677d3213f6ba | An onboarding step with a marketing panel. That belongs to the connect flow research, not management. |
| Duolingo (web social accounts) | https://mobbin.com/screens/c0d0dc52-f88c-4c2c-9687-21de94a5fb06 | A switch used as connect / disconnect. Turning a switch off shouldn't revoke OAuth tokens and purge data. |
| Eventbrite (web linked accounts) | https://mobbin.com/screens/c8c09a99-e3fc-4b74-b1fe-995a8615e88f | Same switch-as-connection problem, and no identity shown. |
| Discord (web connections) | https://mobbin.com/screens/42765e67-f9f6-4431-9e31-a4c0138e19df | A row of unlabeled provider icons for adding accounts. Recognition depends on logos alone. |
| Copilot (web API) | https://mobbin.com/screens/997da229-4b8d-48fc-9985-8d9c31987c91 | A "Reveal secret" action. Our keys are server-only and never come back to the client. |
| Hex (web API keys) | https://mobbin.com/screens/38c4b6f2-6fd6-408e-bb86-d186bc06823a | A show-once generated token. We do the reverse (the user pastes a third-party key), so the pattern doesn't apply. |
| fal (web API keys) | https://mobbin.com/screens/5c62135e-177b-4d3d-89a1-50ce7da52348 | Tags and scope columns. Developer-console metadata a job seeker doesn't need. |
| Tailscale (web keys) | https://mobbin.com/screens/c297c1a1-5541-444d-98f2-0df39369d55f | Dense key tables with revoked-key history. Too technical. |
| Quo (web notifications) | https://mobbin.com/screens/d7532bbc-bcb5-4a7c-93c3-e8d41f6da66e | "Send notifications while I'm off" (double negative), with the schedule hidden behind another toggle. |
| Charma (web notifications) | https://mobbin.com/screens/4c740ed3-0c4c-4b5d-bc33-a270ef0aac9c | Do-not-disturb days are red letter bubbles whose state is only shown by color. |
| ClassDojo (web account settings) | https://mobbin.com/screens/eed66a3a-7b3e-4990-becc-b4abb7cda8cd | A "Quiet hours" switch that doesn't show which hours. |
| HubSpot (web delete) | https://mobbin.com/screens/064317c5-3d53-4bb8-8e04-4e87f9fe238a | A red header shouting "Are you sure…?" and a hub ID to retype. Alarmist. |
| Hotjar (web delete) | https://mobbin.com/screens/8716936f-f0bc-42cb-9027-d1ba8c89f346 | Password re-entry (we have none), two acknowledgment checkboxes and "We're sorry to see you go". |
| Lindy (web delete) | https://mobbin.com/screens/44734cf5-29c5-4667-b1da-a3a3b70bef93 | A required reason dropdown plus a yellow warning box. A forced survey again. |
| Bonsai (web delete) | https://mobbin.com/screens/628f7c7a-ae40-4a07-8cc8-27e661209fe0 | An unlabeled password field and "Yes, Delete My Account" as the only button. |
| Retool (web beta) | https://mobbin.com/screens/44b94595-f7c0-46c7-9db9-808b9b1ada2e | A wall of per-feature beta toggles. We ship one channel switch, not feature flags. |
| 1Password (web beta) | https://mobbin.com/screens/a82871cb-e852-4258-a125-aaa96fa221ef | A single toggle plus a separate "Save Settings" button. |
| PlanetScale (web beta) | https://mobbin.com/screens/9a716b9b-b6cc-4058-ba17-fafbd4d2e907 | An empty beta page. No transferable pattern. |
| Toggl Track (web) | https://mobbin.com/screens/c6f9271e-5854-4174-bee5-691005237d18 | A "Click to reveal" API token and a large illustration in the beta card. |
| 15Five (web export) | https://mobbin.com/screens/8981264a-a763-44d6-bb6f-feacda603be6 | A column-by-column table of the CSV. Too technical for a personal export. |
| Proton Pass (web export) | https://mobbin.com/screens/f9a43080-c9cb-4828-9115-0bd28049147d | Format choice plus a PGP passphrase. Extra steps that §4.9 doesn't ask for. |
| PayPal (web data request) | https://mobbin.com/screens/61d7f92c-0a9e-4672-8a08-56f0de178d10 | A request form with data-type checkboxes and a PDF format. We export everything as one ZIP. |

## Decision — iOS

**Entry:** the avatar button (top right on every tab, §4.1) opens **Settings as a sheet** (ChatGPT). The sheet has a large title, a "Done" button and inset-grouped `List` styling (Monzo / Telegram). Rows use SF Symbol tiles, trailing values and native chevrons.

**Root structure** (each group is a `Section`; footers use native footer text, as in Depop and Family):

1. **Account header.** Sign-in email as a two-line row ("Signed in as · savas@…", ChatGPT) and a Profile row (name, languages, target markets, as collected in onboarding).
2. **Connections** (MacroFactor "Integrations" placement):
   - Mail accounts. Trailing value "2 connected", or an amber dot + "Needs attention" (Telegram badge, never red).
   - Job sources. Trailing value "8 on".
3. **AI.** Trailing value "On" / "Off".
4. **Notifications.** Trailing value "Quiet 22:00–08:00" when a schedule is set.
5. **Data & privacy** (MacroFactor "Data Management", Character AI). Contains Export everything, Keep job email text (value "180 days"), Privacy policy ↗ and Terms ↗.
6. **About.** Version + build (Monzo footer) and Changelog ↗. One line: "Updates arrive through TestFlight." iOS has no update channel (§3).
7. **Sign out** as plain tinted text in its own group.
8. **Delete account** as destructive text in its own last group (Monzo, Discord).

**Mail accounts** (Mesh + Google Health):

- **List.** A "Connected" section lists each address with a provider icon and a subtitle: "Checked 4 min ago", "Checking…" or "Needs reconnecting". The last one uses an amber icon *and* text, never color alone. An "Add account" row at the end opens the connect flow, which is owned by the connect-account research.
- **Account detail.** Status, Last checked, Provider, "Folders checked: Inbox, Spam" (information only; §4.7 includes Spam/Junk), and **Check now**. When the account needs it, a **Reconnect** button sits at the top. **Disconnect…** sits at the bottom as destructive text.
- **Disconnect confirmation** (Podia wording, Uber calmness). An action sheet: title "Disconnect savas@gmail.com?", message "We'll stop checking this inbox, remove our access at Google, and delete the 23 job emails we stored from it. Your applications and their history stay." Buttons: **Disconnect and delete email data** (destructive) and **Keep connected** (cancel).
- **Disconnect is always disconnect + purge** (§4.9). There's no "keep the emails" variant. The application events created from those emails stay, and their source reads "Email removed".

**Job sources** (Google Health "Add connections" descriptions, ElevenLabs masked keys):

- **"Ready to use"** lists the keyless sources (Remotive, Arbeitnow, and "Company job boards → 12 companies" linking to the watchlist editor; see Open question 3). Each has a switch and a one-line coverage description.
- **"Needs a free key"** lists Adzuna, Jooble, USAJOBS and Reed. Each row shows its value first ("UK jobs from Reed") and its key state second: "Add key", or "Key ending 4f2a · used 2 h ago" (incident.io "last used"), or amber "Key stopped working".
- **Key screen.** A one-sentence explanation, a "Get a free key at reed.co.uk ↗" link, and secure text fields as the connector requires (e.g. Adzuna needs app ID + key; USAJOBS needs key + contact email). Save validates server-side with a test request. The stored key is **never shown again**: only the last 4 characters, plus **Replace key** and **Remove key**.

**AI** (Family toggle-with-explanation):

- **Master switch** "Use AI features". Footer: "Used to sort job emails, explain matches and help tailor CVs. AI never invents CV content." (§2.4)
- **"Allow sending email text to AI"** is disabled when the master switch is off. Footer: "Only the parts of job-related emails needed to sort them are sent to Anthropic, which doesn't train on API data. When off, we sort with rules only, so more emails will ask for your review."
- **Provider row:** "Anthropic Claude" (read-only in v1). **Key row:** "Key on server · ending a1B2" with Replace key, using the same write-only key screen as job sources. See Open question 1.

**Notifications** (Linear Mobile + Asana + Outlook + Instagram):

- **Status.** If iOS permission is denied, a top row reads "Notifications are off in iOS Settings" with "Open Settings ↗" (Linear).
- **"From your mail"** has a switch for each kind: Interview invites, Offers, Assessments and deadlines, Decisions, Accounts that need reconnecting. Decisions has a gentle footer: "A short, quiet note when a company decides not to move forward. You can turn this off."
- **"Reminders"** holds Follow-up suggestions.
- **"Quiet hours"**:
  - A switch, then day chips (Mon-first for TR/DE locales), then **From / To** time pills (24 h in TR/DE), then a time-zone line ("Europe/Istanbul · follows this iPhone").
  - A generated summary sentence (Instagram) such as "Quiet every day from 22:00 to 08:00."
  - A **"Send a summary when quiet hours end"** switch, on by default (Basecamp catch-up).
  - Footer (Asana): "We won't send notifications during quiet hours. Everything still shows up in the app."
- **"Pause"** (Outlook Timed group) offers For 1 hour / Until tomorrow morning / Until I turn it back on. While paused, the top of the screen says "Paused until 08:00" with **Resume** (Asana web).

**Export everything** (Slack included/not-included, Trello one button, MacroFactor inline progress, Binance time estimate, Character AI inline confirmation):

- **Content.** One page with "Included" (profile, CVs + every revision, rendered PDFs, cover letters, jobs, saved searches, applications + full history, interviews, contacts, stored job emails, settings) and "Not included" (passwords and keys we hold for you, emails that weren't job-related, which we never stored).
- **Action.** **Create export**. The button shows progress in place ("Preparing… usually under a minute").
- **When ready.** An inline card appears: "Export ready · 14 MB · available until 29 Oct", with **Save to Files** / **Share** (system share sheet). A push notification is sent if the user has left the screen.
- **Past exports.** Listed below with their expiry date.

**Delete account** (Starbucks dedicated screen, Lovable itemized list, Discord verification, Vestiaire clean reset):

1. **Explanation screen.** Title "Delete your account". Then the itemized list of what is deleted:
   - your profile, CVs and all versions, PDFs and cover letters;
   - applications, interviews, contacts and their history;
   - saved jobs and searches;
   - stored job emails;
   - connected mail accounts (we revoke our access at Google / Microsoft / your mail provider);
   - job source keys;
   - signed-in devices.
   Then "This can't be undone." A secondary **Export my data first** button (Hinge warning) and a destructive **Continue**. There's no reason survey and no "sad to see you go".
2. **Verification.** "We sent a code to savas@…" using the sign-in OTP component. The final button **Delete everything** stays disabled until all 6 digits are valid (Render rule).
3. **Progress.** "Deleting your data…" with a determinate spinner. The app then resets to the welcome screen (Vestiaire) with a quiet banner: "Your account and all its data were deleted."

**Behavior:** every setting saves immediately (no Save buttons; Marriott and 1Password rejected). Writes are optimistic, with a small inline "Couldn't save · Retry" on failure. Offline: settings that need the server (keys, disconnect, export, delete) are disabled with the footer "Needs a connection".

## Decision — Desktop (macOS + Windows)

**Entry:** the "Settings" sidebar item (§4.1), **⌘,** on macOS (also the app menu "Settings…") and **Ctrl+,** on Windows. It's also searchable from ⌘K / Ctrl+K (every setting is a palette entry). Settings replaces the main content area, and Esc / "← Back" returns to where the user was (Twenty "Exit Settings", Ghost "Done").

**Layout** (Teams + Google Drive + Buffer):

- A left **settings nav** (220 px) with a search field on top. The `/` shortcut focuses it (Ghost).
- Grouped headings:
  - **Account:** Account.
  - **Connections:** Mail accounts, Job sources.
  - **Preferences:** AI, Notifications.
  - **This computer:** Desktop app, Updates.
  - **Data:** Data & privacy.
- A content column of max 720 px. Each setting is a row with a title, a helper line and a right-aligned control. Switches carry a visible "On" / "Off" label (Teams). Changes autosave, with a transient "Saved" next to the row.

**Pages:**

- **Account.**
  - Sign-in email, Profile, and Sign out.
  - At the bottom, a "Delete account" section with an outlined destructive button (Render placement).
  - The deletion **dialog** (Lovable + Fireflies + Render) contains:
    - the same itemized list as iOS, in a tinted box;
    - "Export my data first" as a link;
    - a 6-digit email-code field ("Send code" first);
    - **Keep my account** (default focus; Esc and Enter both cancel) and **Delete everything** (disabled until the code is valid).
- **Mail accounts** (Adobe Express + Salesforce + Podia):
  - An info banner at the top: "We only keep emails about your job search. Everything else is skipped and never stored."
  - One card per address with:
    - a provider logo;
    - the address;
    - a status with icon + text ("✓ Checked 4 min ago" / "⚠ Needs reconnecting");
    - a primary button only when action is needed (**Reconnect**);
    - an overflow menu with Check now, Reconnect and Disconnect….
  - "+ Add account" opens the connect flow.
  - The disconnect dialog uses the iOS copy, with **Keep connected** as the default button.
- **Job sources** (ElevenLabs + incident.io + Buffer):
  - Same two groups as iOS.
  - Keyed rows show the masked tail, "Last used 2 h ago · 140 jobs", and an enable switch. The overflow menu has Replace key and Remove key.
  - Sources without a key show a Buffer-style inline card: value sentence, **Add key**, "Get a free key ↗".
  - The key dialog validates server-side before closing.
- **AI.** Same content as iOS.
- **Notifications** (Slack + Vanta + Asana + Basecamp):
  - Per-kind switches.
  - A **"Show notifications on this computer"** switch (per device).
  - Quiet hours as one sentence-shaped row: "[Every day ▾] from [22:00 ▾] to [08:00 ▾]". It's followed by the consequence line and the named time zone ("Europe/Berlin, from this computer's clock"; Vanta).
  - The catch-up summary switch.
  - When active, a status line "Quiet until 08:00 · Resume now" (Asana).
- **Desktop app:**
  - "Open BruteForceHR when you log in" (off by default).
  - "Keep running in the menu bar when the window is closed" (macOS) / "Keep running in the system tray when the window is closed" (Windows). It's off by default and opt-in (§4.9), with the helper "Needed for notifications while the window is closed."
- **Updates** (Twenty + Clerk + Buffer):
  - A status card: "BruteForceHR 1.4.2 · Up to date · checked 5 min ago" → "Downloading 1.5.0… 45 %" → "1.5.0 is ready" with **Restart to update** (Buffer "Reload now" pattern). "What's new" is collapsed inside the card (Clerk).
  - **Check for updates** button.
  - **Channel** radio: **Stable** (recommended) / **Beta**, with the helper "Get new versions first. They might have rough edges. Please report what you find." (Twenty caveat).
  - **Read the changelog ↗** (opens the website changelog).
  - Switching back to Stable shows: "You'll move to the next stable version once it's newer than the beta you have." See Open question 5.
- **Data & privacy** (Trello + Slack + beehiiv):
  - Export page: included / not included in two columns, **Create export**, and a Recent exports table (date · size · status chip · **Download**, which opens the native save dialog) with "Files are deleted after 7 days".
  - "Keep job email text" select: 90 / 180 / 365 days after an application closes.
  - Privacy policy ↗ and Terms ↗.

**Keyboard:** ⌘, / Ctrl+, opens Settings. `/` searches settings. ↑ / ↓ moves in the nav, Tab moves through rows, and Space toggles a focused switch. Esc closes dialogs (always the safe option) and then leaves Settings.

**Platform chrome:** native fonts per OS (SF Pro / Segoe UI Variable). Windows uses "Settings" wording and Ctrl shortcuts. macOS uses "Settings…" in the app menu, following macOS 13+ naming (not "Preferences").

## Components needed

| Component | Platforms | Notes |
|---|---|---|
| `SettingsSheet` + `SettingsSection` / `SettingsRow` (value, toggle, link, destructive variants) | iOS | Native `List` inset-grouped. Footers carry the explanations. |
| `SettingsNav` (grouped, searchable) + `SettingsRow` (title, helper, control, On/Off label, saved indicator) | desktop | Settings entries are also registered as ⌘K palette commands. |
| `ConnectionStatus` (icon + text: ok / checking / needs reconnecting / error) | both | Shared with the Mail `AccountHealthBanner`. Amber, never red. |
| `MailAccountCard` / `MailAccountRow` + `MailAccountDetail` | desktop / iOS | Actions call callable functions (`mailAccounts` is client read-only). |
| `DisconnectDialog` (consequence copy with the stored-email count, "Keep connected" default) | both | iOS: action sheet. Desktop: Radix `AlertDialog`. |
| `JobSourceRow` (value line, key state, enable switch) | both | |
| `SecretKeyField` (write-only, paste, multi-field per connector, server validation, masked tail after save) | both | Also used for the AI key. Never echoes the stored secret. |
| `QuietHoursEditor` (days, from/to, time zone, summary sentence, catch-up switch) | both | iOS: pills + chips. Desktop: sentence-shaped selects. Times use `Intl.DateTimeFormat`, and the week start comes from the locale. |
| `PauseNotificationsMenu` + paused status line with Resume | both | |
| `UpdateStatusCard` + `ChannelPicker` | desktop | Wraps electron-updater state. Reused by the desktop update-available banner. |
| `ExportPanel` (included / not included, create, progress, ready card, recent exports) | both | iOS: share sheet / Files. Desktop: native save dialog. |
| `DeleteAccountFlow` (itemized list → code verification → progress → reset) | both | Reuses the onboarding `OtpCodeInput`. Desktop runs as a dialog, iOS as a pushed screen. |
| `InlineSaveState` ("Saved" / "Couldn't save · Retry") | both | |

**Data mapping (proposal; paths beyond the kickoff layout need an ADR, see open questions):**

- **User preferences** are fields on `users/{uid}`: `settings.notifications.{kind}`, `settings.quietHours {enabled, days, start, end, timeZone, summary}`, `settings.ai {enabled, allowEmailText}` and `settings.mailRetentionDays`.
- **Per-device data** goes in `users/{uid}/devices/{id}`: the push token and "show notifications on this computer".
- **Update channel and launch-at-login** are per-install and stored locally by the desktop main process, not in Firestore.
- **Secrets** (job source keys, the AI key, mail tokens) are written only through callable functions into `serverOnly/**` / Secret Manager. Clients read only `{configured, last4, lastUsedAt, lastError}`.
- **Destructive operations** are callable functions:
  - *Disconnect* revokes at the provider, deletes the tokens, and purges that account's `mailMessages`.
  - *Export* builds a ZIP in Storage and returns a short-lived download URL.
  - *Delete* recursively deletes `users/{uid}/**`, deletes the Storage prefix, revokes mail tokens, deletes the job source secrets, and finally deletes the Auth user.

## Copy notes

Tone: plain and reassuring. Destructive copy says exactly what happens, with no guilt ("sad to see you go") and no shouting (no all-caps, no "Are you sure?!"). Safe buttons are worded as the safe choice ("Keep connected", "Keep my account"). TR uses informal "sen" and DE informal "du", matching `today-home.md` and `mail-review.md`.

| Key | EN | TR | DE | Note |
|---|---|---|---|---|
| Settings title | Settings | Ayarlar | Einstellungen | macOS menu: "Settings…" / "Ayarlar…" / "Einstellungen…" |
| Group: connections | Connections | Bağlantılar | Verbindungen | |
| Mail accounts | Mail accounts | E-posta hesapları | E-Mail-Konten | |
| Needs attention | Needs attention | İlgilenmen gerekiyor | Braucht deine Aufmerksamkeit | DE is ~2× EN. The iOS trailing value falls back to the amber dot + "Prüfen" when it's truncated. |
| Account status ok | Checked 4 min ago | 4 dk önce kontrol edildi | Vor 4 Min. geprüft | Same string as Mail. |
| Needs reconnecting | Needs reconnecting | Yeniden bağlanması gerekiyor | Muss neu verbunden werden | |
| Disconnect title | Disconnect savas@gmail.com? | savas@gmail.com bağlantısı kesilsin mi? | savas@gmail.com trennen? | |
| Disconnect body | We'll stop checking this inbox, remove our access at Google, and delete the 23 job emails we stored from it. Your applications and their history stay. | Bu gelen kutusunu kontrol etmeyi bırakacağız, Google erişimimizi kaldıracağız ve buradan sakladığımız 23 iş e-postasını sileceğiz. Başvuruların ve geçmişleri kalır. | Wir prüfen dieses Postfach nicht mehr, entfernen unseren Zugriff bei Google und löschen die 23 gespeicherten Job-Mails daraus. Deine Bewerbungen und ihr Verlauf bleiben erhalten. | Uses ICU plurals. The provider name comes from the account. TR uses a compound ("Google erişimimizi") so no suffix attaches to the provider placeholder (vowel harmony varies by name; see `today-home.md`). |
| Disconnect confirm | Disconnect and delete email data | Bağlantıyı kes ve e-posta verilerini sil | Trennen und E-Mail-Daten löschen | The longest destructive label. Buttons must wrap or stack. |
| Keep connected | Keep connected | Bağlı kalsın | Verbunden lassen | |
| Job sources | Job sources | İş kaynakları | Jobquellen | |
| Needs a free key | Needs a free key | Ücretsiz anahtar gerekiyor | Kostenloser Schlüssel nötig | |
| Key saved | Key ending 4f2a · used 2 h ago | Sonu 4f2a olan anahtar · 2 sa önce kullanıldı | Schlüssel endet auf 4f2a · vor 2 Std. genutzt | |
| Key failed | This key didn't work. Check that it was copied completely. | Bu anahtar çalışmadı. Tamamen kopyalandığını kontrol et. | Dieser Schlüssel hat nicht funktioniert. Prüfe, ob er vollständig kopiert wurde. | |
| AI master | Use AI features | Yapay zekâ özelliklerini kullan | KI-Funktionen verwenden | |
| AI email text | Allow sending email text to AI | E-posta metninin yapay zekâya gönderilmesine izin ver | Senden von E-Mail-Text an die KI erlauben | §4.9 wording, kept literally. |
| AI email footer (off) | When off, we sort with rules only, so more emails will ask for your review. | Kapalıyken yalnızca kurallarla sıralarız; bu yüzden daha fazla e-posta incelemeni ister. | Wenn aus, sortieren wir nur nach Regeln, und mehr E-Mails brauchen deine Prüfung. | |
| Quiet hours | Quiet hours | Sessiz saatler | Ruhezeiten | |
| Quiet summary | Quiet every day from 22:00 to 08:00. | Her gün 22:00–08:00 arası sessiz. | Jeden Tag von 22:00 bis 08:00 Uhr ruhig. | Generated from the selection with `Intl.ListFormat` for day lists. |
| Quiet footer | We won't send notifications during quiet hours. Everything still shows up in the app. | Sessiz saatlerde bildirim göndermeyiz. Her şey yine uygulamada görünür. | Während der Ruhezeiten senden wir keine Mitteilungen. In der App siehst du trotzdem alles. | DE "Mitteilungen" is the iOS term. Desktop uses "Benachrichtigungen". |
| Catch-up | Send a summary when quiet hours end | Sessiz saatler bitince özet gönder | Nach den Ruhezeiten eine Zusammenfassung senden | |
| Decisions toggle footer | A short, quiet note when a company decides not to move forward. You can turn this off. | Bir şirket süreci ilerletmemeye karar verdiğinde kısa ve sakin bir not. Bunu kapatabilirsin. | Eine kurze, ruhige Nachricht, wenn ein Unternehmen nicht weitermacht. Du kannst das ausschalten. | |
| Tray (macOS) | Keep running in the menu bar when the window is closed | Pencere kapalıyken menü çubuğunda çalışmaya devam et | Bei geschlossenem Fenster in der Menüleiste weiterlaufen | |
| Tray (Windows) | Keep running in the system tray when the window is closed | Pencere kapalıyken sistem tepsisinde çalışmaya devam et | Bei geschlossenem Fenster im Infobereich weiterlaufen | DE Windows term is "Infobereich". |
| Channel: beta helper | Get new versions first. They might have rough edges. Please report what you find. | Yeni sürümleri önce al. Bazı pürüzler olabilir; bulduklarını bize bildir. | Neue Versionen zuerst erhalten. Es kann noch holpern, melde uns, was dir auffällt. | |
| Up to date | Up to date · checked 5 min ago | Güncel · 5 dk önce kontrol edildi | Aktuell · vor 5 Min. geprüft | |
| Restart to update | Restart to update | Güncellemek için yeniden başlat | Zum Aktualisieren neu starten | |
| Export button | Create export | Dışa aktarma oluştur | Export erstellen | |
| Export ready | Export ready · 14 MB · available until 29 Oct | Dışa aktarma hazır · 14 MB · son gün: 29 Eki | Export bereit · 14 MB · verfügbar bis 29. Okt. | TR uses a "son gün:" label instead of a suffix on the formatted date. |
| Not included | Not included: passwords and keys we hold for you, and emails that weren't job-related (we never stored them). | Dahil değil: senin için sakladığımız parolalar ve anahtarlar ile işle ilgili olmayan e-postalar (bunları hiç saklamadık). | Nicht enthalten: Passwörter und Schlüssel, die wir für dich verwahren, und E-Mails ohne Jobbezug (die haben wir nie gespeichert). | |
| Delete title | Delete your account | Hesabını sil | Konto löschen | |
| Delete irreversible | This can't be undone. | Bu işlem geri alınamaz. | Das lässt sich nicht rückgängig machen. | |
| Export first | Export my data first | Önce verilerimi dışa aktar | Zuerst meine Daten exportieren | |
| Keep account | Keep my account | Hesabım kalsın | Konto behalten | Default focus. |
| Delete final | Delete everything | Her şeyi sil | Alles löschen | |
| Deleted banner | Your account and all its data were deleted. | Hesabın ve tüm verileri silindi. | Dein Konto und alle Daten wurden gelöscht. | |
| Needs connection | Needs a connection | İnternet bağlantısı gerekiyor | Braucht eine Internetverbindung | |

Layout rules from length expansion: destructive and confirm buttons never have a fixed width. They stack vertically on iOS when either label exceeds half the width (likely for DE "Trennen und E-Mail-Daten löschen"). Desktop dialogs are min 440 px wide and wrap their buttons. Settings rows allow 2-line titles and 3-line helpers.

## Open questions

1. **AI key ownership in multi-user mode.** Kickoff says the Anthropic key is the user's own and stored in Secret Manager. Is it one project-level secret (the owner's key, read-only in the UI, which would show only "Key on server · managed by the app owner") or a per-user key entered in Settings (written through a callable function into `serverOnly/{uid}`)? The UI above supports both. *Recommendation:* per-user write-only, with the owner's key as the fallback while the app stays personal.
2. **New client-readable status paths.** Job source key state (`configured`, `last4`, `lastUsedAt`, `lastError`) and export records (status, size, expiry) have no home in the kickoff Firestore layout. Options: fields on `users/{uid}` vs. new `users/{uid}/jobSources/{id}` and `users/{uid}/exports/{id}` collections. This needs an ADR (owner: DocsAdrPrd).
3. **Where the company watchlist lives.** It feeds the ATS job sources but is edited like content. Should it be a Jobs-area screen linked from Settings (proposed), or a Settings page?
4. **Deletion when email codes can't be sent.** Brevo isn't set up yet (kickoff). If email codes are unavailable, should deletion accept a recent sign-in (< 5 min) instead of a fresh code? *Recommendation:* recent sign-in as the fallback, using Firebase's `auth_time` claim checked server-side.
5. **Beta → Stable switch.** Should switching back to Stable downgrade immediately or wait for the next stable release that's newer than the installed beta? electron-updater has an `allowDowngrade` option tied to channel changes. That needs confirming against current electron-updater docs before implementation. *Recommendation:* wait (no downgrade), which matches the copy above.
6. **Quiet hours exceptions.** Should interview invites be able to bypass quiet hours ("Let interview invites through")? This isn't in §4.9. *Recommendation:* no; the catch-up summary covers it.
7. **Scraped web sources (kickoff, M4).** They'll need per-site enable switches and a rate-limit note under Job sources. Defer the design to M4.
