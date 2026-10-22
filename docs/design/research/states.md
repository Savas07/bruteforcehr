# Empty, loading, error and offline states: design research

Research date: 2026-10-22. Sources: Mobbin MCP `search_screens` with `task_intent` "Design a cross-platform job search, CV builder and application tracker app" and `output_destination: "code"` on every call. The user's saved Mobbin collections only hold website sections (see kickoff), so none apply here. I judged every reference from its screenshot. No images are committed; open the `mobbin_url` to view one. Copy guidance follows `skill://ux-copy`: empty state = what this is + why it's empty + how to start; error = what happened + why + how to fix; loading = set expectations and reduce anxiety. The tone is empathetic for errors and informative for neutral states.

## Scope

Brief §5.3 row **Empty, loading, error, offline states**, covering each core screen (Today, Job detail, CV editor, Tracker board, Mail review) on iOS and desktop. This doc also covers the Undo toast, because the trust principle requires Undo on every automatic or optimistic change, and that toast is the state users see most often after acting.

| Platform | State type | Queries run (all `mode: "deep"`) | Examined | Kept |
|---|---|---|---|---|
| iOS | Empty (first use, no results, caught up) | "empty state screen with illustration, message and call-to-action button"; "search results screen with no results found and suggestion to adjust filters"; "inbox screen in the all caught up state with nothing left to review" | 20 | 10 |
| iOS | Skeleton loading | "list screen in loading state with skeleton placeholder rows"; "detail page loading with skeleton placeholders for header, title and text blocks" | 14 | 7 |
| iOS | Full-screen / pane error | "error screen when content failed to load with retry button" | 8 | 3 |
| iOS | Inline error | "screen with an inline error banner inside a section explaining what failed and how to fix it" | 8 | 4 |
| iOS | Offline banner, queued changes | "screen showing a no internet connection banner while cached content stays visible"; "offline indicator bar at the top of a list saying you are offline" | 14 (unique) | 3 |
| iOS | Undo snackbar | "snackbar toast confirming an item was archived with an undo button" (+1 Undo found in the offline query) | 9 | 4 |
| Desktop (`web`) | Empty (first use, board, caught up) | "empty state in a dashboard content area with message and primary action"; "kanban board with empty columns before any cards are added"; "inbox screen in the all caught up state with nothing left to review" | 20 | 12 |
| Desktop (`web`) | Skeleton loading | "app page loading with skeleton placeholders for list and detail panes" | 8 | 4 |
| Desktop (`web`) | Pane error | "error state inside the app content area when data failed to load, with retry action and sidebar still visible" | 8 | 3 |
| Desktop (`web`) | Inline error | "settings or form page with an inline alert callout explaining a failed save or sync and an action to fix it" (+1 found in the offline query) | 9 | 4 |
| Desktop (`web`) | Offline banner, sync / save status | "app screen with a you are offline banner and changes will sync when reconnected"; "document editor with a saving or all changes saved status indicator in the toolbar" (+ Revolut reused from the error query) | 13 | 7 (+1 reused) |
| Desktop (`web`) | Undo toast | "toast notification confirming an item was moved or archived with an undo action" | 8 | 4 |

Totals: iOS 73 examined / 31 kept; desktop 66 examined / 34 kept.

Platform facts these decisions rely on (kickoff + brief §6.3/§6.5): Firestore offline persistence is the outbox. Reads come from the local cache and writes queue until the device reconnects. Cloud Functions calls (AI tailoring, match analysis, sending mail, iOS PDF export, mail connect, job-source refresh) are **not** queued, so they need a connection. Desktop PDF export uses Electron `printToPDF` locally and works offline. Mail is polled server-side, so new mail only shows up after the client reconnects.

## References

### iOS: empty states

| App | Screen / state | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Coursera | Learn tab, nothing enrolled | https://mobbin.com/screens/7e5f69c8-bf8b-4a66-99dc-c811a1aeded7 | Bold title "You haven't enrolled in any courses (yet)", one supporting sentence, one primary button that names the next step ("Explore courses"), and a small tinted line icon. | It's the textbook what + how-to-start structure. A single CTA keeps the first step obvious. |
| AllTrails | Notifications, nothing yet | https://mobbin.com/screens/7b19c424-ab83-4a7e-b5af-0cddd9e72658 | A small monochrome glyph, "Nothing to see… yet", a line explaining *what will appear here and when*, and one dark CTA. | Saying what will arrive makes the empty state feel temporary rather than a failure. The muted glyph fits a calm tone. |
| Agoda | Messages, no conversations | https://mobbin.com/screens/7e41c6f4-5413-4ae5-afe0-21b67443e570 | The empty state sits *inside* the content card, and the secondary action is an outlined button that leads elsewhere ("Go to my bookings"). | This is our pattern for empty sub-areas (an empty Tracker column, an empty CV section) where a full-screen takeover would be too much. |
| Ubank | Tracked bills, none yet | https://mobbin.com/screens/0f38d793-9dc5-4c87-b22f-c4c0290797fa | The header keeps its real title and a plain count line ("Total of 0 bills tracked") above the centered empty body and CTA. | Navigation chrome stays real in empty states, so users always know where they are. |
| Google Drive | Search, no matching results | https://mobbin.com/screens/f9f86637-40e2-4126-a850-5106dc9cf02a | Active filter chips stay visible with "Clear all", plus a primary "Clear filters" CTA under "No matching results / Try another search". | The cause of the empty result (filters) stays visible next to the fix. This fits the Jobs and Tracker filters. |
| LinkedIn | Search, no results found | https://mobbin.com/screens/994c2b74-b200-413e-9fef-1f3bb9632ab9 | Two side-by-side actions, "Edit search" (outlined) and "Remove all filters" (filled), under copy that names both causes. | Offers both ways out at once. It's the closest domain match (LinkedIn Jobs). |
| Slack | Search, nothing turned up | https://mobbin.com/screens/409c36af-ae1c-4b92-b901-50d25f53f4dc | Text-only no-results state (no illustration), per-tab zero counts ("Messages 0, Files 0"), and an "Edit search" CTA. | No-results is a frequent, transient state, so it shouldn't carry a big illustration. |
| Fiverr | Archive, filtered empty | https://mobbin.com/screens/19725416-3f07-42c5-9eee-d924c433d1f9 | The headline is the fix ("Try adjusting your filters"), with a text-link "Clear Filters". | The lightest variant, for filtered lists that are usually populated (Tracker list view). |
| Notion | Inbox, all caught up | https://mobbin.com/screens/97a17109-8022-42e1-bbe4-c43480ba8cfe | Small check-box glyph, "You're all caught up", a line on what arrives here, and a text action "Change filter". | This is the Mail review caught-up state: neutral, no praise, and a way to see other items. |
| Airalo | Inbox, all caught up, with filter tabs | https://mobbin.com/screens/460d78fd-bc6f-4830-99e3-3266f96a544f | Filter tabs stay visible, and the body explains which kinds of messages will show up here. | Listing the categories ("interview invites, replies, rejections") teaches what Mail review does. |

### iOS: skeleton loading

| App | Screen / state | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Wise | Transactions list loading | https://mobbin.com/screens/23814fae-967d-4436-958b-1528dbd1626a | Search field and filter chips are real and interactive. Only the rows are skeletons, shaped like the real row (avatar circle, two text lines, right-aligned two-line value). | Shape-matched rows prevent layout shift. Real filters let users refine before data arrives. |
| Quizlet | Folder detail loading | https://mobbin.com/screens/2e62d572-9596-42dc-9c15-121a0b8d489f | Real icon + title header, a short section-label skeleton, then 5 row skeletons (not a full screen of them). | A known title plus a bounded skeleton reads as "almost there" rather than "empty". |
| Instagram | Discover people loading | https://mobbin.com/screens/08f3f7be-088d-4977-8867-50c10465950c | Very low-contrast avatar + two-line rows under a real nav bar and tab bar. | Subtle skeleton contrast keeps loading calm. Tab bar stays usable. |
| Finimize | "Building your feed…" | https://mobbin.com/screens/a0ac7917-f698-42e8-85ce-8d6cf3949eb9 | A plain-language label above three skeleton rows while a personalised feed is assembled. | This fits AI-backed waits (new matches, match analysis): name the work being done, not just "Loading". |
| Trainline | Ticket options loading | https://mobbin.com/screens/e7a287a4-0d1d-491a-b3f3-9e85ce594c94 | Real nav title, skeleton blocks grouped into the real sections, and a skeleton of the sticky bottom action bar. | Job detail on iOS has a sticky Apply bar, and the skeleton should reserve its space. |
| Swiggy | Detail loading in grouped cards | https://mobbin.com/screens/157d2a19-df5e-4eb7-9cf4-0e134d591baa | Each section card is outlined with its own skeleton content, plus a bottom CTA skeleton. | Card-grouped skeletons map to Job detail sections (summary, match reasons, description). |
| LinkedIn | "Review job post" while AI drafts | https://mobbin.com/screens/32d8f2b6-bfa9-41ae-a19c-6ec6fd0e0c79 | Four centered text-line skeletons above a sentence that says what's being generated. | This fits CV tailoring and cover-letter drafting. We borrow the honest label, not the boastful "1 billion members" claim. |

### iOS: full-screen / pane errors

| App | Screen / state | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Glow | Owner detail, network error | https://mobbin.com/screens/40002101-c026-4d71-9f55-82cef3db9415 | The header with known data stays. Only the content area shows a muted glyph, a title, what + how-to-fix copy ("check your connection and try again"), and a "Retry" pill with an icon. | The error is scoped to what failed, so known context never disappears. |
| Subway | Unable to load product | https://mobbin.com/screens/b8bbfbfb-5299-41c5-a7c5-4874daafc3ad | Paired actions: primary "Try Again" and secondary "Go back". | There's always an escape hatch besides retrying a failing call. |
| Noom | "We couldn't process your photo" | https://mobbin.com/screens/46a84752-17ac-441b-b955-02f3a9ac5f34 | A first-person-plural title ("We couldn't…"), specific fix steps in the body, and one teal "Try again". | "We couldn't" puts responsibility on the app, not the user. That's the calm, supportive voice for CV import failures. |

### iOS: inline errors

| App | Screen / state | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Lloyds | Search, inline service problem | https://mobbin.com/screens/703f45f6-5c95-4b3a-a966-4cedd6f67ae4 | A tinted, rounded callout directly under the input, with a bold title + body, while the query text stays in place. | The error sits next to its cause and the user's input is preserved. |
| Structured | iCloud Sync status card | https://mobbin.com/screens/c350864d-ad8c-4220-baf7-ac13557b52e7 | A status card "Error while syncing" in Settings, plus a help link underneath. | Model for the Mail account / sync status row in Settings. (We drop the raw `CKErrorDomain` code from the main text.) |
| LinkedIn | Create passkey, inline failure | https://mobbin.com/screens/7a03218e-22d0-4fbe-8a4b-cb6d5a4560ce | The error line appears immediately under the button that failed, with an icon + text (not color alone). | Proximity: the user sees the error where they acted. (We replace "Sorry, something went wrong" with a specific cause.) |
| Posh | Upload error toast | https://mobbin.com/screens/84e3f3ba-13cd-4334-b618-f7c69fb91757 | Two-line error with a title and a *specific, fixable* reason ("Video size must be less than 15MB"). | This fits CV import limits (file type / size). The reason is the useful part. |

### iOS: offline banner and queued changes

| App | Screen / state | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Alta | Help chat, network offline | https://mobbin.com/screens/2b00c4b9-d2a6-4a6a-9d95-2aba49348be1 | An inline banner under the header: bold status "Network offline. Reconnecting…" plus the consequence ("No messages can be received or sent for now"). Cached content stays below. | Status + consequence in two lines. The page stays readable. |
| Docusign | Agreements, syncing offline work | https://mobbin.com/screens/42948b73-a83c-40c0-819c-6f96133201dc | A full-width "Syncing offline envelopes" strip, and a per-row "Sync pending" label with a timestamp. | This is exactly our outbox: rows touched while offline show they're queued, and the strip shows the flush happening. |
| Google Maps | Offline area downloaded | https://mobbin.com/screens/0a5f3227-5464-4c0e-88b4-4715317171ff | A reassuring snackbar: "Just use Maps normally, even when offline." | It tells users what still works, which is the most calming offline message we can give. |

### iOS: Undo snackbars

| App | Screen / state | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Google Drive | File moved to folder | https://mobbin.com/screens/db60a3e2-1e3a-414c-926e-2776b2f5dfcd | The message names the object *and* the destination ("'IMG_9853.JPG' moved to 'Work'") with a right-aligned "Undo". | Maps 1:1 to "Acme · Frontend Engineer moved to Interviewing · Undo". |
| Gmail | Message archived | https://mobbin.com/screens/d5187615-adaf-4a7d-ba16-c75ac4799634 | Dark snackbar docked above the tab bar. It doesn't cover the tab bar, and the FAB moves up. | Placement doesn't block navigation or the primary action. |
| Linear Mobile | Notification snoozed | https://mobbin.com/screens/3d9ccfd8-2425-49e9-a00b-27189140d3a3 | A leading glyph for the action type (clock = snoozed), short text, and "Undo", above a floating tab bar. | The glyph lets snooze / done / move toasts be told apart at a glance. This fits Today. |
| Google Drive | "File will be made available offline" | https://mobbin.com/screens/b6157ce0-25ef-4c08-9049-5d41b0d0adb4 | The same snackbar format is used for a *setting-like* change, still with Undo. | Proves one toast component can serve every reversible change, including "Not interested" on a job. |

### Desktop: empty states

| App | Screen / state | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| folk | Dashboards, none yet | https://mobbin.com/screens/25e43e96-b95a-4a18-a520-7330ffd94d60 | A value-led headline ("Get insights with dashboards"), a short line, and a small dark CTA above a *ghost preview* of the populated layout (grey chart cards). | The ghost layout shows what the page will become. We use it for Insights and the first-run Tracker board. |
| Attio | New dashboard, no reports | https://mobbin.com/screens/73c69573-7aa5-468b-accb-96e66de4ce24 | A thin line illustration, two short lines ("No reports in this dashboard yet / Build your first report"), and "+ Create first report". The header "Add report" stays available too. | Compact, calm and keyboard-reachable. The header action means the empty state isn't the only way in. |
| Hashnode | Guides, none created | https://mobbin.com/screens/dd74d23e-81e9-4a1c-a6b8-d3c79a3b486e | The empty state sits inside a bordered container under the real page title + "New" button. The copy says where items will appear ("All your guides will show up here"). | Keeps the page skeleton intact, which suits the desktop multi-pane layout. |
| Canny | Portal not set up | https://mobbin.com/screens/258b4dc5-b41f-4613-b778-c4fa4ab912b4 | One sentence on what this area is for, then a secondary + primary button pair ("Get to admin view" / "Create first board"). | It explains the purpose before asking for action, which suits Mail review before any account is connected. |
| Mixpanel | New board, two ways to start | https://mobbin.com/screens/73a0e03f-002c-4b85-bd1b-a5f7dbc102ff | Two equal choice cards ("Add to Board" / "Use a Template") plus a help link. | This is the CV list empty state: Import a CV / Start from scratch. |
| Programa | Project board, empty columns | https://mobbin.com/screens/d12827a1-62a3-4442-8139-737b83985d09 | All columns render with "0" counts and "+ Add Task" footers. The explainer + CTA sits inside the first column only. | Users see the whole pipeline (our statuses) before the first card exists, and the first step lives where the first card will go. |
| Jira | Board, no work items | https://mobbin.com/screens/3ea4cfae-aa4e-4439-a62a-5f5066fed25e | Column headers with counts stay on top. A centered explainer below says what a board is for and has one CTA. | An alternative layout when a column-1 CTA would be too narrow (the narrow desktop window). |
| Trello | Board, all columns filtered out | https://mobbin.com/screens/0beaa51f-068c-4751-9836-162f9b246210 | A per-column "0 cards match filters" line and a toolbar filter chip with "Clear all". | It separates "filtered to empty" from "truly empty" without a big empty state. |
| Replit | Task board, some columns empty | https://mobbin.com/screens/ddb5b083-389a-49e4-88c1-ee7f2cfae621 | A quiet centered "No tasks" in empty columns next to populated ones. | An empty column in a partly filled board needs only a muted line, not a CTA. |
| Plain | All threads, inbox zero | https://mobbin.com/screens/c5eb74a8-5b66-4a45-a093-adbf076da2cd | A small bordered card "Inbox zero" with one gentle line, with status tabs and zero counts kept above. | Minimal and calm. The tabs show where other items are (we drop the "Nice one" praise). |
| HubSpot | Inbox, no open conversations | https://mobbin.com/screens/55e0d664-417f-45d0-93ed-e8be79200ee0 | The list pane says "No conversations". The detail pane carries the explanation ("No open conversations here / You're all caught up."). | This is how a two-pane empty state splits: a terse list pane and a reassuring detail pane. |
| Height | Inbox caught up + shortcut toast | https://mobbin.com/screens/d9d42488-459e-4785-ba38-94bc55ab7963 | A quiet "You're all caught up!" in the list pane, plus a bottom-left hint showing the related keyboard shortcut. | Keyboard-first desktop: empty states can teach the shortcut for the next action. |

### Desktop: skeleton loading

| App | Screen / state | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Neon | Computes table loading | https://mobbin.com/screens/9b5b1374-c015-495b-abcb-9cce659c741b | Sidebar, breadcrumbs and section title "Computes" are real. Table rows are column-aligned skeleton bars, and a tiny spinner sits in the top bar. | Only the data is unknown, so only the data is skeleton. The column alignment matches the Tracker table view. |
| Fabric | Two-pane loading | https://mobbin.com/screens/46846b8b-226e-4952-a05a-97f5b7bb11a1 | The left pane shows list-row skeletons and the right pane shows form-field skeletons, each shaped to its content. | Maps to Jobs list + Job detail, and to CV form + preview. |
| Chronicle | "Creating storyline…" | https://mobbin.com/screens/fbeab89c-f418-442b-9fa2-ba67efa47c56 | A sparkle glyph + label above block skeletons that fade out lower on the page. | A labelled AI-generation skeleton for CV tailoring / cover-letter drafts on desktop. |
| Square | Report page loading | https://mobbin.com/screens/09371ef3-f0d0-4fc9-8ab1-607ab3d0e4ab | Toolbar-shaped skeletons (search pill + filter pill), a chart block, and a table whose skeleton columns align with the header grid. | Insights and the Tracker table reuse this composition. |

### Desktop: pane errors

| App | Screen / state | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Remote | Talent insights failed to load | https://mobbin.com/screens/ac946a89-0a9f-45b6-b75d-6797bee210a1 | Page title, description and tabs stay. The content area shows "Sorry, something went wrong on our end", what failed, how to fix it, and a primary "Retry". | "On our end" takes responsibility. Scoping the error keeps navigation and context. |
| Revolut Business | Cards pane, connection issue | https://mobbin.com/screens/b719158e-0a19-4b2e-8cc0-5217648ea20a | The error is confined to one card pane, filters stay visible, and the side card still works. A thin "✓ Back online" bar sits at the top of the window. | Other panes keep working when one fails, and recovery is announced quietly. |
| Care.com | Results pane failed, filters usable | https://mobbin.com/screens/5bea7e07-ed66-498c-9862-a7e7110507f2 | The filter panel stays fully usable next to a failed results pane with "Retry". | The Jobs screen keeps its filters when a source fails. (We use a smaller glyph than their illustration.) |

### Desktop: inline errors

| App | Screen / state | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Podia | Domain settings, validation | https://mobbin.com/screens/d5836f00-c66f-4748-a5a5-db4e6371194a | A summary callout at the top listing each problem, *and* a field-level message under the field with an example of the right format plus "Learn more". | The summary helps on long forms (CV editor); the field message tells users how to fix it. |
| Patreon | Profile settings, validation | https://mobbin.com/screens/cb9f9a4d-4056-4be3-b0f1-a37f28c966ec | A tinted summary alert at the top of the card, a red field border, and a helper line with an icon under the field. | It uses icon + text + border, not color alone (accessibility). |
| Pipedrive | Company info modal, required fields | https://mobbin.com/screens/d9f53d0e-8d1c-418e-80d9-5781ae29307d | Field errors next to a "Why is this needed?" side explainer, plus a "Your work is auto-saved" indicator in the page toolbar. | Explaining *why* a field matters reduces frustration, and the auto-save line reassures. |
| Customer.io | Integration disabled callout | https://mobbin.com/screens/0798eb2e-54fd-434b-b023-c374add64362 | A full-width tinted callout with a title, the consequence ("Data is not being received…"), and the fix action right-aligned ("Enable destination"). | This is the Mail account needs-re-auth banner: consequence + one-click fix in one row. |

### Desktop: offline and sync status

| App | Screen / state | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Plain | Workspace, user offline | https://mobbin.com/screens/fa888f77-f234-4694-9eba-9e64af24ac83 | A thin, neutral, full-width strip above the app: icon + "You are currently **offline**." + the consequence, with an action button and "Dismiss". The app below stays fully usable. | Low-height and non-alarming, with the consequence stated. It's the closest match to our desktop banner. |
| Podia | Messaging, disconnected | https://mobbin.com/screens/9aa533e5-2042-4aaf-9470-097fef5f080c | The disconnected notice sits *inside the affected pane* (above the composer) and says what can't happen ("won't be able to send or receive messages"). | Use it for features that need the server: show the notice where the user would try to act. |
| Revolut Business | "Back online" strip | https://mobbin.com/screens/b719158e-0a19-4b2e-8cc0-5217648ea20a | A thin top bar with "✓ Back online" on reconnect. | Recovery is acknowledged without a toast competing with Undo toasts. (Reused from the error query.) |
| Uniswap | Degraded data, still usable | https://mobbin.com/screens/db8fd6f1-71d4-4179-a11b-36e4f9bee3ab | A side card "v2 data will be back soon… **You can still** swap and provide liquidity…" | The "you can still…" phrasing tells users what keeps working. (We reject the duplicate error toast on the same screen.) |
| Meetup | Mailchimp sync, disconnected | https://mobbin.com/screens/9a6077fe-c60a-4d32-8ce4-743766568e57 | A "Disconnected" status pill + "Reconnect" button on the account row. Dependent controls below are disabled. "How it works" is explained above. | Model for the per-account status in Mail settings and in the Mail review header. |
| Remote | Document editor, "All changes saved" | https://mobbin.com/screens/6d561544-2624-4398-bdf5-33608895aeeb | A green dot + "All changes saved" in the editor toolbar, top right. | CV editor save status: always visible, tiny, reassuring. |
| Asana | Project brief, "Saved · Just now" | https://mobbin.com/screens/a5bd4ef5-d4ff-4b4f-bc2d-28ec7875c95b | Muted "Saved · Just now" beside the Done button. | A relative timestamp tells users how recent the save is. |
| Confluence | Page editor, "Saved" | https://mobbin.com/screens/82ddc5ce-4bcd-44b8-a35a-9e0e8b1182ee | A one-word muted "Saved" beside the primary action, with no icon. | The quietest form, for when nothing needs attention. |

### Desktop: Undo toasts

| App | Screen / state | `mobbin_url` | What we borrow | Why |
|---|---|---|---|---|
| Todoist | "Date updated to Tomorrow 17:00" | https://mobbin.com/screens/75c4093b-73e7-4344-b2e7-54e90d94e58c | Bottom-left dark toast. The *new value* is shown and linked, followed by "Undo" and a close ✕. | Showing the result ("to Interviewing") rather than just "Updated" lets users verify the change. |
| Proton | "Conversation moved to Trash." | https://mobbin.com/screens/aca5c4f1-489f-4091-b0d0-3d4063394581 | A compact pill toast at bottom center of the content area: sentence + bold "Undo" + ✕. | Compact and centered under the list being acted on. Good for Mail review. |
| Netflix | "*Wednesday* has been removed from My List." | https://mobbin.com/screens/5211d5f6-c653-4210-aead-047adec26c9a | The object name is bold inside the sentence, and Undo has a circular-arrow glyph. | The bold object name works across languages, and the glyph helps when TR/DE labels get long. |
| Fibery | 'Form "New form" was restored' | https://mobbin.com/screens/762eacbd-2fb7-452d-a5c5-f631a55cc564 | A bottom-right toast with a *follow-up* action ("View") instead of Undo after a restore. | After an Undo, the follow-up toast offers "Open" instead of "Undo", which avoids an undo-of-undo loop. |

## Examined but rejected

### iOS

| App | `mobbin_url` | Reason |
|---|---|---|
| Forest | https://mobbin.com/screens/b1fbdb71-07d6-4f6b-96e5-7303638ae4de | The empty state is a sales pitch ("Grab a bundle"). An empty state shouldn't push a purchase. |
| Discord | https://mobbin.com/screens/6ed25b59-0b8e-4125-9a86-8260d0822797 | Big mascot with joke copy ("Wumpus is waiting on friends"). Too playful for a stressful task, and the joke doesn't translate. |
| Blinkit | https://mobbin.com/screens/91b3493b-015d-4427-8615-16138c937372 | A large mascot and a title only, with no explanation of why the list is empty. |
| Lex | https://mobbin.com/screens/201f3bf5-bafc-451b-b87f-0227919c7304 | Rhetorical-question copy ("Maybe you can boop someone first?"). Agoda covers the card-scoped pattern better. |
| Monzo | https://mobbin.com/screens/6e42fb9b-be71-40ab-af76-04c54dee6978 | "No luck, let's try a different way". Tying "luck" to a failed job search is the wrong emotional note, and the big eyeball illustration is noisy. |
| Snoonu | https://mobbin.com/screens/0c811013-9f50-41e2-ab80-57df265a1f2c | No-results state with no action. The fix is only implied. |
| GitHub | https://mobbin.com/screens/1e3cc364-ad46-4cb6-a1a7-e183684cea8a | Large scene illustration and "Take a break, write some code". Heavy, and the joke is product-specific. |
| Waking Up | https://mobbin.com/screens/b43ad12e-e8ed-4a50-a2c5-cb864285b649 | Bare text with nothing about what arrives here. |
| Notion Mail | https://mobbin.com/screens/69dd5df2-5dbf-48f5-919c-8252cb081d31 | An idiom ("no mail carriers in sight") that won't localise to TR/DE. |
| Uber | https://mobbin.com/screens/16882fc8-99f8-4fbb-b86f-d88998f336c4 | The caught-up copy turns into marketing ("discover new offers"), and the check icon is saturated. |
| Google | https://mobbin.com/screens/c18a51d4-44f9-445c-abac-10c3c384ad2e | Uniform full-width bars that don't match any content shape, so content shifts on load. |
| Spotify Kids | https://mobbin.com/screens/071f97bd-3d7f-4812-8a3d-97f7e6fc86e9 | Saturated, high-contrast blocks. Loud rather than calm. |
| Grab | https://mobbin.com/screens/7c2679a0-c95a-453d-8a53-f3cdd9ea649f | The search bar is a skeleton too. Chrome we already know should render for real. |
| Tabby | https://mobbin.com/screens/f95eb99c-f3ac-4b84-b310-baaa40fd0e60 | The nav title is also a skeleton, so users can't tell where they are. |
| Lovi | https://mobbin.com/screens/278fa40d-ef7f-4935-b3a8-12e3ef1a4122 | Near-invisible skeleton contrast. It reads as a blank screen. |
| Garmin Connect | https://mobbin.com/screens/a7c20d58-3803-40b3-a953-837f7546b6db | Heavy dark blocks that dominate the screen in dark mode. |
| Runna | https://mobbin.com/screens/19ff2a9e-4026-4f31-96cd-06168372f588 | A single big grey block with no structure, so it doesn't preview anything. |
| Whering | https://mobbin.com/screens/a51e3129-3023-4ec3-92ee-0e7643a7bd08 | "Error loading content" with no why or how. The scoped layout is fine, but Glow does it better. |
| Prime Video | https://mobbin.com/screens/7f93f562-2680-4876-9cc2-c11898ae4092 | Long, defensive copy ("contact Amazon Customer Service"). |
| PayPal | https://mobbin.com/screens/305815a1-eb96-4544-bde7-c1342b7e15ce | A red warning triangle for a temporary outage is alarming, and the title ("Sorry About the Wait") doesn't match the problem. |
| MyDyson | https://mobbin.com/screens/428368da-df49-4ae6-9f60-4244315ed039 | A full-screen takeover modal. Users lose all context. |
| Plenty of Fish | https://mobbin.com/screens/05df64cf-e3b6-475c-a746-9c8dfe33eb88 | "Oh no!" plus a fish-skeleton joke. Whimsy in an error. |
| eBay | https://mobbin.com/screens/84b502c6-b7a6-470f-aecf-067b5d0ac854 | Full-width red "Attention buyer" bar and a raw error code. Alarming. |
| CVS Health | https://mobbin.com/screens/3a6f056d-9bf4-45c9-a869-a63eda20ff39 | "Oops!" with no action. |
| Tinder | https://mobbin.com/screens/a37f4d92-90ec-495a-8ba6-157ad4e2874c | The error toast overlaps the title and the CTA is all-caps. Shouty. |
| Strava | https://mobbin.com/screens/8cd2e29d-258d-43d3-8489-1c8ad542d011 | Generic red bar "Something went wrong, please try again" that's detached from any control. |
| Qantas | https://mobbin.com/screens/18f77caf-19d5-4199-98b4-a36f34096d23 | Offline *replaces* the cached Trips list with a full error, shows an error code, and repeats the message in a toast. |
| LARQ | https://mobbin.com/screens/6b859147-a151-4dd4-b92e-9e8e5fd0ae81 | Salmon-red bottom banner for a non-urgent "hasn't connected in a while". |
| Crouton | https://mobbin.com/screens/ddd84b6b-6c87-46d3-baa9-74e95e3a037c | The overlay card greys out the content, which implies the content can't be used. |
| Notion | https://mobbin.com/screens/712f6960-bd55-4e4d-9398-53c70322deaa | An "Offline pages" list with no connectivity state signal. Nothing to borrow. |
| Headspace | https://mobbin.com/screens/43d841d6-90be-4f12-8082-874271af24ea | Download management, not a connectivity state. |
| Twitch (following) | https://mobbin.com/screens/37ec55b2-4a1b-4f6c-accf-9f5e1a477edc | "Offline" means a streamer's status here, not the device. Wrong meaning. |
| Twitch (broadcast) | https://mobbin.com/screens/15e311e6-1af7-4f04-a544-f535ea54267d | Same: stream status, not connectivity. |
| Swiggy (store) | https://mobbin.com/screens/d610d8e3-37a9-4b29-85a4-c8ab289e0a7c | A store closure page with a large illustration. Not about connectivity. |
| Plex | https://mobbin.com/screens/ede735fb-ca89-45aa-b33d-2f95d3983ff8 | Device discovery sheet. Not about connectivity. |
| Grab Driver | https://mobbin.com/screens/f21cc30a-b0e8-4c8e-9de8-3a829706255c | A diagnostics page with a large illustration and red "issue detected". Heavy. |
| LinkedIn | https://mobbin.com/screens/4c80128a-b28d-407d-863b-5d6df3100157 | The Undo toast sits at the *top* and covers the filter chips. Bottom placement is easier to reach. |
| CVS Health | https://mobbin.com/screens/f8dca081-488d-4e7c-b79f-9f9281222c3a | Passive voice ("1 notification was deleted"), and the heavy pill Undo button competes with content. |
| Starbucks | https://mobbin.com/screens/61b33ba0-e230-45fe-aa76-00f98047abe4 | Full-width brand-green bar fused to the tab bar. It reads as part of the navigation. |
| Chime | https://mobbin.com/screens/07910db5-539d-4ba0-810d-6b644cfed68e | Large card toast with "Undo ›" below the text. Covers several list rows. |
| Quo | https://mobbin.com/screens/28233f22-360a-456d-9973-ef2942fdf2fa | Low-contrast grey "Undo" on a dark toast that's hard to see. |

### Desktop

| App | `mobbin_url` | Reason |
|---|---|---|
| Amplitude | https://mobbin.com/screens/041c94d1-a5f2-4f81-bdd8-605bb91596ec | The success toast at top center overlaps the global search. The empty body is fine but adds nothing beyond Attio. |
| Basedash | https://mobbin.com/screens/e8be089a-4841-4693-852b-427c96690749 | A dotted ASCII illustration adds visual noise. |
| Render | https://mobbin.com/screens/a6df9a92-49ef-4eb9-ac73-9a72f7c4cdff | A jargon-heavy paragraph in an empty state. |
| Todoist (board) | https://mobbin.com/screens/c68cc8b6-70ca-4194-9feb-903f9f650747 | Empty columns with no guidance at all. First-time users get no help. |
| Strut | https://mobbin.com/screens/cbbbce9e-3116-45dd-8b29-02cdbd87dd85 | Stages collapse into list rows, so the board model is lost. |
| ClickUp | https://mobbin.com/screens/f784aba7-c329-4e4f-90b2-6f21a0a2a70d | "Congratulations!" + 🎉 + a motivational quote. Gamified praise, the guilt/reward pattern we avoid. |
| Front | https://mobbin.com/screens/d45e3c73-35a6-4917-b5fa-50c84e4b65d2 | "Mission accomplished! Sit back and relax…" is an idiom, and triumphant. |
| Asana (caught up) | https://mobbin.com/screens/11bac340-6b54-4e27-a670-6817aa55c571 | "Hooray" and a disco-ball illustration. Celebratory. |
| Linktree | https://mobbin.com/screens/d120cb6e-466e-442e-9a83-1e3833c00c65 | Generic slabs that don't match the content shape. |
| GoFundMe | https://mobbin.com/screens/f764e9fc-e5cf-4e0f-89ea-bd778d2fa88a | A full-screen brand-color takeover for a labelled wait. Chronicle does the same in-page. |
| Klook | https://mobbin.com/screens/f85829bb-3add-4047-819b-b9e82e535a96 | The whole page, sidebar included, is a skeleton, with extremely low contrast. |
| Babbel | https://mobbin.com/screens/eb4a4034-4605-4b51-b624-da8989c143b8 | Large uniform blocks unrelated to the real layout. |
| Height (error) | https://mobbin.com/screens/bd98fbd3-903c-4b52-9a17-fd3ce92fc0ad | An emoji in the error, and "Try again" offered for a *not found* object where retrying can't help. |
| TIDAL | https://mobbin.com/screens/548b60c5-b45d-4ca9-81db-17875594fcd5 | The same error is shown twice (center + toast), with a generic "Something went wrong". |
| Uvodo | https://mobbin.com/screens/0fc36669-7ed2-401f-95f4-69ef585eed99 | A server-error toast floats over an unrelated upsell page, and it's unclear what failed. |
| Family | https://mobbin.com/screens/816f6fc6-eae0-4f3a-9a7b-f48dd53bb107 | Exposes a raw `InvariantError` to the user. |
| Unity | https://mobbin.com/screens/c598fa3d-6ac6-40fc-bebc-cddfc355bb81 | A huge title with a vague body ("Something went wrong with the payment"). The destination-labelled button is the only good part. |
| HoneyBook | https://mobbin.com/screens/304261aa-817f-44fd-be0e-75b71a07fb52 | A validation error in a modal *over* a modal, with "OK". It blocks the field it refers to. |
| X | https://mobbin.com/screens/bc899282-ed52-4470-8fb4-118ebd89ca75 | A blocking modal with "Got it" for a fixable input problem. |
| Pinterest (CSV) | https://mobbin.com/screens/92465343-1e44-4584-ab91-ecd177cf858d | "Hmm…that didn't work" modal. Casual filler, and the modal hides the file row that has "See errors". |
| Cloudflare | https://mobbin.com/screens/e8049d79-5b54-4b4d-906e-3484a3eebbf8 | A generic "One or more required fields are missing" line far from the fields. |
| Okta | https://mobbin.com/screens/8e4c6b78-c408-43f9-8f59-ba9291636b13 | "We found some errors" without saying which ones. |
| Klaviyo | https://mobbin.com/screens/edd5d1e3-a036-4831-afd6-0f31beff2e9b | A success toast over a bare spinner. Not an offline pattern. |
| Zoho CRM | https://mobbin.com/screens/ee7a467e-2e6a-422d-b82e-e2c5e4c8afb5 | A success toast overlapping a modal. Not an offline pattern. |
| Coda (sync) | https://mobbin.com/screens/ee2f5dbc-8ba1-4cf2-9687-4e3315e041ce | A manual "Sync now" model. Our sync is automatic, so a manual button would suggest it isn't. |
| Jasper | https://mobbin.com/screens/80a7470b-d204-48bb-926a-2b10300570f7 | No visible save state in the editor. |
| Cofounder | https://mobbin.com/screens/34883a5c-cd50-461b-a24d-c59c21a289b1 | A manual "Unsaved changes" + Save/Discard model. The CV editor autosaves. |
| Plane | https://mobbin.com/screens/e5711257-ff0e-4502-bf91-cf82316a81cb | A "Generating summary" banner. An AI progress pattern, not about sync. Chronicle covers AI waits. |
| Coda (undo) | https://mobbin.com/screens/580abcac-fdb0-4c72-b6ea-b529d42bfa1e | A light two-line card with a small blue "Undo" link under the text. Weak contrast against the page. |
| Pinterest (undo) | https://mobbin.com/screens/70234394-ca14-4def-8aa4-e9784fdccae1 | "Update removed!" The exclamation is over-excited for a removal. |
| Asana (deleted) | https://mobbin.com/screens/36cb9092-004d-4cfa-abc7-930e4a7ff931 | A red ✕ illustration and a full-page "was deleted" plus a separate Undo toast. Two competing recovery paths. |
| Quicken | https://mobbin.com/screens/e9042731-b020-4b97-b8b7-b5ad5a97db06 | The Undo toast competes with a modal spinner and a coach-mark at the same time. |

Also noted: Hashnode's "Guide deleted" toast (https://mobbin.com/screens/dd74d23e-81e9-4a1c-a6b8-d3c79a3b486e) confirms a deletion **without** Undo. We never ship a destructive toast without Undo.

## Cross-platform rules (apply to both decisions)

1. **State precedence per pane:** cached data always wins. With Firestore persistence, a pane shows cached data instantly and refreshes in place. Skeletons appear only on a cold load with no cache. Errors only replace content when there's nothing cached to show. Otherwise the content stays and an inline alert sits above it (stale + reason + Try again).
2. **Scope every state to the smallest region that owns it** (Glow, Remote, Revolut, Care.com). Navigation chrome (sidebar, tab bar, nav titles, filters, column headers) always renders for real. No full-screen takeover except the `min_supported_version` gate and signed-out auth.
3. **Skeletons:** shape-matched to the real component (Wise, Neon, Fabric), shown only after **300 ms** (no flash on fast loads) and then kept for at least **500 ms** (no flicker). Show at most one viewport of rows. A soft shimmer plays only if Reduce Motion is off; otherwise the skeleton is static. `aria-busy` / `accessibilityState.busy` is set on the pane, with a label such as "Loading applications".
4. **Labelled waits for AI / server work** (Finimize, LinkedIn, Chronicle): name the work ("Checking how this job fits your CV…"). After **10 s**, add: "This can take up to a minute. You can keep working; we'll show it here." These waits never block navigation.
5. **Errors** follow what + why + how to fix, written in first person plural ("We couldn't…"). They're never shown in red alone (icon + text + border). Raw codes never appear in the body; a "Copy details" disclosure holds them for support. Retry is labelled **Try again**. Not-found errors offer navigation, not retry (Height rejection).
6. **Offline:** a neutral (not red) connection banner appears after **2 s** of confirmed offline, which debounces flapping networks. Content stays usable. Rows changed offline show a waiting-to-sync glyph, driven by Firestore `hasPendingWrites`, and cached panes show "Updated 09:12" (from `fromCache`) [INFERENCE: metadata flags as exposed by the Firestore JS and React Native Firebase snapshot APIs; confirm during implementation]. Server-only actions are disabled in place with a reason ("Needs a connection"), never hidden. On reconnect: "Back online" for 3 s, then "All changes synced" if anything was queued (Revolut, Docusign). If a queued write is rejected after reconnect (rules / state machine), an inline alert explains which change didn't save and offers to review it.
7. **Undo toast:** after every optimistic or automatic change. The copy names the object + result + Undo (Google Drive, Todoist, Netflix). It stays for 6 s, or 10 s when VoiceOver / a screen reader is running or the text exceeds 60 characters, and pauses on hover / focus. One toast is visible at a time; a newer one replaces the older, which stays undoable through ⌘Z / Ctrl+Z and the application history. After Undo, a follow-up toast says "Restored" with "Open" (Fibery), never another Undo. Toasts are announced politely (`aria-live="polite"` / `UIAccessibility` announcement). Automatic changes from mail also persist as rows with source + reason (Today doc), so the toast isn't the only place to undo them.
8. **Empty states come in four kinds**, sized differently:
   - first-use: icon ≤ 48 pt, title, one line, one primary CTA + optional secondary;
   - no-results / filtered: text only, the filters stay visible, "Clear filters" CTA;
   - caught-up: neutral, says what arrives here, no praise / confetti / counters;
   - sub-area empty (column, section): one muted line or a ghost row.
   
   Illustrations are monochrome line glyphs from the icon set. No mascots, no scenes.

## Decision — iOS

- **Connection banner:** a compact inline banner pinned under the navigation bar (or under the large title once it collapses) on every tab, using the Alta structure: bold status + one consequence line. Neutral surface, `wifi.slash` SF Symbol. It isn't dismissible while offline, but it collapses to one line on scroll. "Back online" replaces it for 3 s.
- **Queued rows:** a small `clock.arrow.circlepath` glyph next to the row's meta line with the accessibility label "Waiting to sync" (Docusign "Sync pending").
- **Undo snackbar:** dark, docked 8 pt above the tab bar (Gmail, Linear), with a leading action glyph, text, and a trailing "Undo" (tap target ≥ 44 pt). Swipe down to dismiss. It never overlays the sticky Apply bar on Job detail; it stacks above it.
- **Pane error:** the Glow layout inside the content area under real chrome, with primary "Try again" and, on pushed screens, a secondary "Go back" (Subway).
- **Inline error:** a rounded tinted callout under the control or section that failed (Lloyds). Field errors sit under the field with an icon (LinkedIn passkey).
- **Pull to refresh** stays available on every list. If a refresh fails, an inline stale alert appears and the cached content stays.

### iOS per-screen treatment

| Screen | Empty | Loading (cold, no cache) | Error | Offline | Undo |
|---|---|---|---|---|---|
| **Today** | First run: dismissible "Connect your email…" card plus "Find jobs" (defined in `today-home.md`). Caught up: "You're all caught up. New updates will show up here." Empty sections are hidden, never shown with "0". | Real large title + date, then 3 section-card skeletons made of `AttentionRow` shapes (chip circle, 2 lines, trailing chip). | Each section fails on its own: an inline alert inside that section ("Couldn't load new matches. Your other updates are current. Try again"). Pane error only if every section fails with no cache. | Banner. Cached sections with an "Updated 09:12" stamp on New matches. Confirm / Done / Snooze / Dismiss queue optimistically with the sync glyph. "Draft follow-up" saves locally; Send is disabled with "Needs a connection". | Toast after Confirm, Done, Snooze, Dismiss, Not needed. Auto-applied mail changes keep their Undo row. |
| **Job detail** | No description from the source: inline "This posting has no description. Open the original posting". Delisted: top inline note "This job is no longer listed" + saved copy below. | The header (company chip, title, location) renders instantly from the list row. Section-card skeletons for description + match reasons, plus a sticky Apply-bar skeleton (Trainline, Swiggy). Match analysis uses a labelled wait. | Description fetch failed: inline alert in the description card, with the search snippet shown, "Try again" and "Open original". Job deleted: pane error "This job isn't in your list anymore" + "Back to Jobs". | Banner. Cached job readable. Save / Not interested / status changes queue. "Tailor CV" and "Apply with AI" are disabled with footnote "Needs a connection. Tailoring runs on our server." | Save, Not interested, status change. |
| **CV editor** | No CVs: two stacked choice rows (Mixpanel): "Import a CV" (primary) / "Start from scratch". Empty section inside a CV: ghost row "+ Add your first role". | Form-section skeletons under the real nav bar. The preview tab shows a page-shaped skeleton with "Rendering preview…". Import shows a labelled wait with steps ("Reading your file… / Finding sections… / Checking dates…"). | Field errors inline under the field ("End date is before start date"). Save failure: the status turns to "Couldn't save · Try again" (local copy kept). Import failure (Noom tone): "We couldn't read this PDF…" + "Choose another file" / "Start from scratch". Version conflict: banner with "Keep this version / Use the other version / Compare" (see Open questions). | Editing continues. Nav-bar status reads "Saved on this device". Export PDF and ATS check are disabled with "Needs a connection" (iOS renders on the server). | Removing an entry or section shows a toast "Removed 'Acme — Senior Engineer'. Undo". Text edits use the system shake / ⌘Z undo. |
| **Tracker** (iOS board = status-grouped list / paged columns per IA doc) | No applications: Coursera-style centered "No applications yet" + "Add application" (primary) / "Find jobs" (secondary). Filtered empty: text-only "No applications match these filters" + "Clear filters" (Google Drive, Fiverr). Empty status group: muted "Nothing here" line (Agoda card scope). | Real status headers (statuses are static from `@bfhr/core`) with "–" counts, plus 2 card skeletons per visible group. | Pane error under real headers if nothing is cached. A rejected move (state machine) springs the card back with an inline toast explaining the rule, plus "Try again" on write failure. | Banner. Moves queue with the sync glyph on the card. Ghosted suggestions still show (computed locally). | Every move: "Moved Acme · Frontend Engineer to Interviewing. Undo". |
| **Mail review** | No account: Canny-style explanation + "Connect email" (primary). Caught up: Notion/Airalo style "Nothing to review" + what arrives here + "See recent updates" text action. | Row skeletons (sender circle, 2 lines, trailing time) like Wise / Instagram. The review sheet opens with field skeletons. | Needs re-auth: inline account banner at the top (Customer.io / Meetup pattern) with "Reconnect". An email that couldn't be classified becomes a row "We couldn't tell what this email means. Open it to sort it yourself." | Banner. Queue readable from cache. Confirm / Change queue. Header stamp "Last checked 09:40". Footnote "New emails will appear when you're back online." | Confirm / Change: "Marked as interview invite · Acme moved to Interviewing. Undo". |

## Decision — Desktop (macOS + Windows)

- **Connection strip:** a 28 px neutral strip across the top of the main content (below the macOS traffic-light title-bar area / Windows title bar), using Plain's structure: icon + "You're offline." + consequence. No dismiss while offline. The **sidebar footer** shows a persistent sync line: "Synced · just now" / "3 changes waiting to sync" / "Offline". The same text appears in the native menu-bar tooltip. "Back online" shows in the strip for 3 s (Revolut).
- **Pane-scoped states:** every pane (list, detail, rail) owns its own empty / loading / error state. One pane failing never blanks the others (Revolut, Care.com). In the two-pane layout, the list pane gets terse copy and the detail pane gets the explanation (HubSpot).
- **Skeletons:** column-aligned for tables (Neon, Square), row-shaped for lists, form-shaped for detail (Fabric). A refresh with cache shows a 12 px spinner in the toolbar, not a skeleton (Neon).
- **Undo toast:** dark pill at the bottom center of the *content area* (Proton), not the window, so it sits under the list being acted on. ✕ close, Undo with a glyph (Netflix), pause on hover. ⌘Z / Ctrl+Z undoes the latest change while the toast is visible and afterwards (history stack). The shortcut hint appears in the toast's tooltip.
- **Forms (CV editor, Apply, Settings):** a summary callout at the top for 2 or more errors, linking to each field (Podia). Field messages include an example of the right format. Inline "Why we ask" helpers where useful (Pipedrive).
- **Keyboard:** each empty state's primary action shows its shortcut (Height), e.g. "Add application ⌘N / Ctrl+N". Error retry is focusable, and focus moves to it when a pane error appears.

### Desktop per-screen treatment

| Screen | Empty | Loading (cold, no cache) | Error | Offline | Undo |
|---|---|---|---|---|---|
| **Today** | Same content as iOS (`today-home.md`). Caught-up text sits in the main column; the agenda rail keeps its own "No interviews this week" line. | Real header, section skeletons in the main column, row skeletons in the agenda rail. | Per-section inline alert. The rail fails on its own. | Strip + sidebar sync line. Actions queue. Send / AI actions are disabled with a tooltip and an inline footnote. | Toast + ⌘Z. Auto changes keep their Undo row. |
| **Job detail** (detail pane next to the Jobs list) | Nothing selected: "Select a job to see the details" + hint "↑ ↓ to move · Enter to open". No description / delisted: same as iOS. | Header from the selected list row instantly. Description + match blocks as Fabric-style skeletons. Match analysis as a Chronicle-style labelled wait. | Inline alert in the description block (snippet kept, "Try again", "Open original"). The list pane keeps working (Care.com). | Strip. Cached job readable. Tailor / Apply with AI disabled with the tooltip "Needs a connection". | Save, Not interested, status change. |
| **CV editor** (form + live preview) | No CVs: Mixpanel two-card choice "Import a CV" / "Start from scratch". Empty section: ghost row. | Form skeleton + page-shaped preview skeleton (Fabric two-pane). Import shows a labelled step list. | Field errors + summary callout (Podia, Patreon). Toolbar save status turns to "Couldn't save · Try again". Conflict banner above the form. Import failure in the import dialog itself. | Toolbar status "Saved on this device". **PDF export still works** (local `printToPDF`). DOCX export works if it's generated client-side [INFERENCE: depends on where `docx` runs; confirm in M2]. ATS check / tailoring disabled with a reason. | Removing an entry/section shows a toast. Text edits use the native ⌘Z stack. |
| **Tracker board** | No applications: every status column renders with "0" and a "+ Add" footer. The explainer + "Add application ⌘N" / "Import CSV" sits in the first column (Programa); below 1200 px wide it moves to a centered explainer under the headers (Jira). Filtered empty: per column "None match these filters" + "Clear filters" in the toolbar (Trello). Single empty column in a filled board: muted "No applications" line + drop hint while dragging (Replit). | Real column headers with "–" counts and 2–3 card skeletons per column. | Board pane error under real headers if nothing is cached (Remote). A rejected drag springs back with a toast stating the rule. Write failure: toast with "Try again". | Strip. Drag-moves queue with the sync glyph on the card. Column counts update optimistically. | Every move: toast + ⌘Z, keyboard moves included (`⌘⇧→` etc. per the shortcuts doc). |
| **Mail review** (queue list + review detail) | No account: Canny-style explainer with "Connect email". Caught up: list pane "Nothing to review" (Plain card); detail pane: what arrives here + "See recent updates" (HubSpot split). | List row skeletons + review-detail field skeletons. Polling refresh shows a toolbar spinner. | Re-auth callout at the top of the list (Customer.io): consequence + "Reconnect". Unclassified email row as on iOS. Detail-pane fetch failure is scoped to that pane. | Strip + "Last checked 09:40" in the list header + the footnote "New emails will appear when you're back online" (Podia in-pane notice). Confirm / Change queue. | Toast at the bottom center of the list pane + ⌘Z. |

## Components needed

| Component | Platforms | Notes |
|---|---|---|
| `EmptyState` (variants `firstUse`, `noResults`, `caughtUp`, `subArea`; slots: glyph, title, body, primary, secondary, shortcut hint) | both | Glyph ≤ 48 pt from the icon set. `subArea` is one muted line. Today's `EmptyState` (today-home.md) is this component. |
| `ChoiceCards` (2-up start options) | both | CV list empty (Import / Start from scratch). Stacked rows on iOS. |
| `GhostRow` ("+ Add your first role") | both | Empty sections inside the CV editor and Tracker columns. |
| `Skeleton` primitives (`SkeletonText`, `SkeletonBlock`, `SkeletonCircle`) + composites (`AttentionRowSkeleton`, `JobRowSkeleton`, `JobDetailSkeleton`, `BoardCardSkeleton`, `MailRowSkeleton`, `CvFormSkeleton`, `CvPreviewSkeleton`, `TableRowSkeleton`) | both | Built from the same layout tokens as the real components. 300 ms show delay, 500 ms minimum. Shimmer off under Reduce Motion. Tokens: `skeleton.base` / `skeleton.highlight` in light and dark. |
| `ProgressNote` (labelled wait with optional step list and a 10 s "can take up to a minute" line) | both | AI tailoring, match analysis, CV import, iOS PDF export. |
| `PaneError` (glyph, title, body, Try again, optional Go back / Copy details) | both | Scoped to its pane. Focus moves to Try again on desktop. |
| `InlineAlert` (`info` / `warning` / `error`; title, body, action, optional dismiss) | both | Stale data, section failures, re-auth (Customer.io layout), CV conflict, rejected queued write. |
| `FieldError` + `ErrorSummary` | both | Icon + text + border. The summary links to its fields (desktop) or scrolls to them (iOS). |
| `ConnectionBanner` (offline / back online / syncing) | iOS banner, desktop strip | Neutral surface. 2 s debounce. Announced politely. |
| `SyncGlyph` (waiting to sync) | both | Driven by the snapshot's `hasPendingWrites`. Accessibility label "Waiting to sync". |
| `SyncStatus` (sidebar footer / editor toolbar: Saved · just now / Saving… / Saved on this device / Couldn't save · Try again / n changes waiting) | desktop sidebar + editors; iOS editor nav bar | Remote / Asana / Confluence patterns. |
| `StaleStamp` ("Updated 09:12", "Last checked 09:40") | both | Locale time formats (24 h for TR/DE). |
| `NeedsConnection` (disabled-action reason: tooltip on desktop, footnote on iOS) | both | Never hide the action. |
| `UndoToast` + toast queue | both | Shared app-wide (also listed in today-home.md). Action glyph, object + result text, Undo, ✕. Follow-up "Restored · Open". |
| `AccountStatusPill` (Connected / Needs sign-in / Paused) | both | Mail settings + Mail review header (Meetup). |

## Copy notes

Voice per `skill://ux-copy`: errors are empathetic and helpful, warnings clear and actionable, neutral states informative and concise, and success messages low-key. Job hunting is stressful, so we never use "Oops", "No luck", "Unfortunately", "Hooray", exclamation marks, mascots or idioms. We say "we" for the app's failures and never blame the user. Terms stay consistent: *application*, *job*, *CV* (never "resume" in EN UI), *email* (never "mail" in body copy), *Try again* (never "Retry" / "Reload"), *Undo*, *offline*, *sync*. TR uses informal "sen" and DE informal "du", matching `today-home.md`.

### UX Copy: connection banner (iOS banner / desktop strip)

**Recommended copy**: "You're offline. Your changes are saved on this device and will sync when you're back online."

| Option | Copy | Tone | Best for |
|---|---|---|---|
| A | You're offline. Your changes are saved on this device and will sync when you're back online. | Reassuring | Desktop strip (has the width) |
| B | You're offline. Changes will sync later. | Neutral, short | iOS banner second line, iPhone 17e width |
| C | Offline · 3 changes waiting to sync | Informative | Desktop sidebar footer / `SyncStatus` |

**Rationale:** it states what happened and the consequence in one breath, and answers the user's real worry (is my work lost?) before they ask. Alta and Plain both pair status with consequence, and Google Maps shows that the reassurance part is the most calming.

**Localization notes:** "sync" → TR "eşitlemek" (not "senkronize", which is longer and more technical); DE "synchronisieren". DE runs ~35% longer, so the iOS banner must allow two lines rather than truncate.

### UX Copy: pane load error

**Recommended copy**: title "We couldn't load your applications", body "Our server didn't respond. Your saved data is safe. Try again in a moment.", button "Try again".

| Option | Copy | Tone | Best for |
|---|---|---|---|
| A | We couldn't load your applications. Our server didn't respond. Your saved data is safe. | Empathetic | Server / function failure |
| B | We couldn't load your applications. Check your connection, then try again. | Actionable | Network failure while online status is unknown |
| C | Couldn't refresh. Showing what was saved at 14:05. | Neutral | Inline stale alert when a cache exists |

**Rationale:** what + why + how to fix. "Your saved data is safe" heads off the main fear. "We" takes responsibility (Noom, Remote).

**Localization notes:** the object noun ("your applications", "this job", "your CV") is a per-screen variable in EN only. TR and DE need a whole translated sentence per screen, because case endings change (TR "başvurularını", DE "deine Bewerbungen"). Don't build these sentences from fragments.

### String table (EN / TR / DE)

| Key | EN | TR | DE | Note |
|---|---|---|---|---|
| offline.banner | You're offline. Changes will sync later. | Çevrimdışısın. Değişikliklerin daha sonra eşitlenecek. | Du bist offline. Deine Änderungen werden später synchronisiert. | DE ≈ +40%. |
| offline.back | Back online. All changes synced. | Yeniden çevrimiçisin. Tüm değişiklikler eşitlendi. | Wieder online. Alle Änderungen sind synchronisiert. | Second sentence only if something was queued. |
| sync.pending | Waiting to sync | Eşitlenmeyi bekliyor | Wartet auf Synchronisierung | Accessibility label for `SyncGlyph`. |
| sync.rejected | 1 change couldn't be saved. {reason} | 1 değişiklik kaydedilemedi. {reason} | 1 Änderung konnte nicht gespeichert werden. {reason} | ICU plural; `{reason}` is its own full sentence. |
| needsConnection | Needs a connection | İnternet bağlantısı gerekiyor | Nur online verfügbar | DE uses "only available online" (more natural). |
| needsConnection.tailor | Tailoring runs on our server, so it needs a connection. Your CV is saved on this device. | Uyarlama sunucumuzda çalıştığı için bağlantı gerekiyor. CV'n bu cihazda kayıtlı. | Das Anpassen läuft auf unserem Server und braucht eine Verbindung. Dein Lebenslauf ist auf diesem Gerät gespeichert. | |
| stale.inline | Couldn't refresh. Showing what was saved at {time}. | Yenilenemedi. {time} itibarıyla kaydedilenler gösteriliyor. | Aktualisierung fehlgeschlagen. Angezeigt wird der Stand von {time}. | `{time}` is locale-formatted. |
| error.tryAgain | Try again | Tekrar dene | Erneut versuchen | |
| error.goBack | Go back | Geri dön | Zurück | |
| error.load.applications | We couldn't load your applications. Our server didn't respond. Your saved data is safe. | Başvurularını yükleyemedik. Sunucumuz yanıt vermedi. Kayıtlı verilerin güvende. | Wir konnten deine Bewerbungen nicht laden. Unser Server hat nicht geantwortet. Deine gespeicherten Daten sind sicher. | One full sentence per screen. |
| loading.match | Checking how this job fits your CV… | Bu işin CV'ne ne kadar uyduğuna bakıyoruz… | Wir prüfen, wie gut die Stelle zu deinem Lebenslauf passt … | DE puts a space before the ellipsis per Duden. |
| loading.long | This can take up to a minute. You can keep working; we'll show it here. | Bu bir dakika kadar sürebilir. Çalışmaya devam edebilirsin; hazır olunca burada göstereceğiz. | Das kann bis zu einer Minute dauern. Du kannst weiterarbeiten – das Ergebnis erscheint hier. | Appears after 10 s. |
| loading.import | Reading your CV… | CV'ni okuyoruz… | Wir lesen deinen Lebenslauf … | Steps: Finding sections… / Checking dates… |
| save.saved / saving / local / failed | Saved · {relative} / Saving… / Saved on this device / Couldn't save · Try again | Kaydedildi · {relative} / Kaydediliyor… / Bu cihaza kaydedildi / Kaydedilemedi · Tekrar dene | Gespeichert · {relative} / Wird gespeichert … / Auf diesem Gerät gespeichert / Nicht gespeichert · Erneut versuchen | `{relative}` via `Intl.RelativeTimeFormat`. |
| tracker.empty | No applications yet. Add a job you've applied to, or save one from Jobs to track it here. | Henüz başvuru yok. Başvurduğun bir işi ekle ya da İşler'den birini kaydet; takibi burada yaparsın. | Noch keine Bewerbungen. Füge eine Stelle hinzu, auf die du dich beworben hast, oder speichere eine unter „Jobs", um sie hier zu verfolgen. | CTAs: Add application / Başvuru ekle / Bewerbung hinzufügen · Find jobs / İş bul / Jobs finden. |
| filter.empty.applications | No applications match these filters | Bu filtrelere uyan başvuru yok | Keine Bewerbungen passen zu diesen Filtern | CTA: Clear filters / Filtreleri temizle / Filter zurücksetzen. |
| column.empty | No applications | Başvuru yok | Keine Bewerbungen | Sub-area empty: one muted line. |
| cv.empty | No CVs yet. Import the CV you already have and we'll make it editable, or start from a blank page. | Henüz CV yok. Mevcut CV'ni içe aktar, düzenlenebilir hale getirelim ya da boş bir sayfadan başla. | Noch kein Lebenslauf. Importiere deinen vorhandenen Lebenslauf – wir machen ihn bearbeitbar – oder fang mit einer leeren Seite an. | CTAs: Import a CV / CV içe aktar / Lebenslauf importieren · Start from scratch / Sıfırdan başla / Neu beginnen. |
| cv.import.failed | We couldn't read this PDF. It may be a scanned image. Try a DOCX or JSON Resume file, or start from scratch. Your original file is still attached. | Bu PDF'yi okuyamadık. Taranmış bir görsel olabilir. DOCX ya da JSON Resume dosyası dene veya sıfırdan başla. Orijinal dosyan ekli duruyor. | Wir konnten diese PDF nicht lesen. Möglicherweise ist sie nur ein eingescanntes Bild. Versuch es mit einer DOCX- oder JSON-Resume-Datei oder fang neu an. Deine Originaldatei bleibt angehängt. | Noom tone. CTA: Choose another file / Başka dosya seç / Andere Datei wählen. TR "PDF'yi" follows the spoken "pe-de-fe". |
| cv.conflict | This CV changed on another device. {device} saved a newer version at {time}. | Bu CV başka bir cihazda değişti. {device}, {time} saatinde daha yeni bir sürüm kaydetti. | Dieser Lebenslauf wurde auf einem anderen Gerät geändert. {device} hat um {time} eine neuere Version gespeichert. | CTAs: Keep this version / Bu sürümü koru / Diese Version behalten · Use the other version / Diğer sürümü kullan / Andere Version verwenden · Compare / Karşılaştır / Vergleichen. Replaces the brief's "keep mine / keep theirs": there's only one user, so "theirs" confuses. |
| job.delisted | This job is no longer listed. {source} removed it on {date}. Your saved copy is below. | Bu ilan artık yayında değil. {source} ilanı {date} tarihinde kaldırdı. Kaydettiğin kopya aşağıda. | Diese Stelle ist nicht mehr ausgeschrieben. {source} hat sie am {date} entfernt. Deine gespeicherte Kopie steht unten. | |
| job.noSelection | Select a job to see the details | Ayrıntıları görmek için bir iş seç | Wähle eine Stelle aus, um die Details zu sehen | Desktop only, plus a shortcut hint. |
| mail.noAccount | Connect your email and we'll find replies about your applications. When we're not sure what an email means, we'll ask you first. | E-postanı bağla, başvurularınla ilgili yanıtları bulalım. Bir e-postadan emin olmadığımızda önce sana soracağız. | Verbinde dein E-Mail-Konto, dann finden wir Antworten zu deinen Bewerbungen. Wenn wir unsicher sind, fragen wir dich zuerst. | CTA: Connect email / E-postayı bağla / E-Mail verbinden. |
| mail.caughtUp | Nothing to review. When we're not sure what an email means, we'll ask you here. | İncelenecek bir şey yok. Bir e-postadan emin olmadığımızda sana burada soracağız. | Nichts zu prüfen. Wenn wir bei einer E-Mail unsicher sind, fragen wir dich hier. | Text action: See recent updates / Son güncellemeleri gör / Letzte Updates ansehen. |
| mail.reauth | {provider} needs you to sign in again. We paused checking {account} on {date}. Reconnect to pick up where we left off. | {provider} yeniden giriş yapmanı istiyor. {account} hesabını {date} tarihinden beri kontrol etmiyoruz. Kaldığımız yerden devam etmek için yeniden bağlan. | {provider} braucht eine erneute Anmeldung. Seit dem {date} prüfen wir {account} nicht mehr. Verbinde das Konto neu, dann machen wir dort weiter. | CTA: Reconnect / Yeniden bağlan / Neu verbinden. |
| mail.unclassified | We couldn't tell what this email means. Open it to sort it yourself. | Bu e-postanın ne anlama geldiğini çıkaramadık. Açıp kendin sınıflandırabilirsin. | Wir konnten diese E-Mail nicht zuordnen. Öffne sie, um sie selbst einzuordnen. | |
| mail.offlineFootnote | New emails will appear when you're back online. | Yeni e-postalar yeniden çevrimiçi olduğunda görünecek. | Neue E-Mails erscheinen, sobald du wieder online bist. | |
| undo.move | Moved {application} to {status}. Undo | {application}, {status} aşamasına taşındı. Geri al | {application} nach „{status}" verschoben. Rückgängig | `{status}` comes from the shared status dictionary. |
| undo.removed | Removed "{item}". Undo | "{item}" kaldırıldı. Geri al | „{item}" entfernt. Rückgängig | TR keeps EN-style quotes; DE uses „…". |
| undo.restored | Restored. Open | Geri alındı. Aç | Wiederhergestellt. Öffnen | Follow-up toast after Undo. |

**Length expansion:** plan for DE at +35–40% and TR at +20–30% over EN in banners, toasts and buttons. On iOS, toasts and banners wrap to 2 lines and never truncate. Buttons in empty states stack vertically when either label passes 18 characters (Savee rule in `today-home.md`). Desktop toasts cap at 480 px and wrap. Test every state on iPhone 17e with DE and Dynamic Type XL.

**TR placeholder suffixes:** Turkish case suffixes follow vowel harmony and need an apostrophe after proper nouns ("Acme'den", "Google'dan"). The strings above avoid attaching suffixes to `{company}` / `{application}` / `{source}` placeholders: they put the placeholder in subject position or before a noun such as "aşamasına" / "tarihinde". Translators must keep that rule (see Open questions about `today-home.md`).

## Open questions

1. **CV version conflict UI.** The banner copy and actions are decided here, but the *Compare* view (side-by-side diff of two CV versions) has no Mobbin reference in this doc. It belongs in the CV editor research (`cv-editor.md`). Please confirm that owner picks it up.
2. **Desktop Undo toast position:** bottom center of the content area (Proton, chosen) vs. bottom left (Todoist). Bottom left keeps it near the sidebar sync line but far from the list being acted on. Revisit in the desktop critique round.
3. **Stale-cache threshold:** after how long should cached data show an explicit "Updated {time}" stamp even while online (proposal: when `fromCache` is true, or data is older than 15 min)?
4. **Queued-change retention:** if the app stays offline for days, should queued Tracker moves warn ("3 changes from Monday are still waiting") or sync silently whenever the connection returns? The proposal is silent sync plus the existing sidebar count.
5. **TR suffixes in `today-home.md` (resolved 2026-10-22):** the Today owner restructured the strings so no suffix attaches to a placeholder. They now read "Mülakat aşamasına taşındı. Kaynak: Acme e-postası. Geri al" and "Mülakat daveti gibi görünüyor · Gönderen: Acme". `insights.md` also dropped the number suffix. The rule from Copy notes now applies app-wide.
6. **iOS banner scope:** show the connection banner on every tab (proposed, so behavior is consistent), or only on tabs with server-dependent actions? Critique round to decide.
7. **Auto-retry for Cloud Functions calls** (tailoring, send): one silent retry with backoff before showing an error is proposed. The final policy belongs in the `@bfhr/api` functions-client ADR, not here.
