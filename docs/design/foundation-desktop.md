# Desktop foundation (M0): contract for screen agents

Status: M0, 2026-10-22. The shared layer the five desktop core screens are built on: Today, Job detail, CV editor, Tracker board and Mail review. Tokens and rules are in [system.md](system.md), components in [components.md](components.md), and keys in [IA.md § Keyboard map](IA.md#keyboard-map).

## What you own

| You may edit                                                                                                                                                      | You may not edit                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/desktop/src/features/<your-screen>/**`: `Screen.tsx` (the view), sub-components, view-only hooks, plus additions to your own `model.ts` and `model.test.ts` | `src/shared/**`, `src/design/**`, `src/components/**`, `src/lib/**`, `src/router.tsx`, `src/main.tsx`, `scripts/**`, `e2e/**`, `src-tauri/**`, other screens' folders, `packages/**` |
| `docs/design/critiques/desktop/<your-screen>/r<N>.md`                                                                                                             | Every other doc, including this one                                                                                                                                                  |
| Your own ids (`<screen>.*`) in `src/i18n/en.json` (via `pnpm i18n:extract`), `tr.json` and `de.json`                                                              | Other ids in the catalogs                                                                                                                                                            |

If you need a change in a shared file (a new prop, a fix, a new shared component), send DesktopFoundation (or Main) one short message with the exact change. Don't fork shared components into your folder.

Screen ids are also folder names: `today`, `job-detail`, `cv-editor`, `tracker-board`, `mail-review`.

## Folder layout (`apps/desktop/src`)

```
main.tsx                 picks production or design route views (compile-time __BFHR_DESIGN__)
router.tsx               the one route tree (paths from IA.md § Deep links) + RouteViewsContext
components/              shell: AppShell, Sidebar, CommandPalette, ShortcutsSheet, RouteContainer
lib/                     Tauri bridge (desktop.ts), destinations, static ⌘ shortcuts (menu-mirrored)
shared/
  model/                 types.ts, blocks.ts, build-blocks.ts, format.ts, vocabulary.ts, fixture-context.ts
  keyboard/              keymap.ts (registry), useKeyBindings.ts
  ui/                    shared components (catalogue below), focus.ts, layout.ts
  screen.ts              ScreenProps<Model>, screenIds
  connectivity.ts        useConnectivity()
  cx.ts                  class join
features/<screen>/       model.ts + model.test.ts (foundation) · Screen.tsx (you)
design/                  design build only: matrix, DesignRoot, DesignScreen, screens registry, index, demo
```

## The screen contract

Create `src/features/<screen>/Screen.tsx` with a **default export**:

```tsx
import type { ScreenProps } from "../../shared/screen";
import type { TodayModel } from "./model";

export default function TodayScreen({ model, params }: ScreenProps<TodayModel>) {
  // model: Loadable<TodayModel> = { status: "loading" } | { status: "error"; retry() }
  //        | { status: "ready"; data; fromCache; updatedAt: TimeVM; updatedClock: string }
}
```

- The design build finds the file by itself (`import.meta.glob` in `src/design/DesignScreen.tsx`), so there's nothing to register. Until the file exists, the route shows a harness note.
- Render exactly one `ScreenTitle` (`shared/ui/ScreenTitle`) in every state. It is the `h1` that keyboard navigation focuses, and it sets the window title.
- Views never format dates, compute statuses or touch `@bfhr/core` entities. If something is missing, extend your `model.ts` (pure function + test).
- `params` holds the route params plus the non-design search params: `jobId`, `cvId`, `messageId`, `applicationId`, `folder`, `item`, `category`.
- Actions have no backend in M0. Make them optimistic in local state and show the matching `Toast` (Undo), so the critique captures the real feedback.
- States (states.md, per pane, smallest region): `loading` → shape-matched skeletons in `SkeletonRegion`. `error` → `PaneError` under the real chrome. `ready` with empty data → the `EmptyState` kind the model signals. `ready` with `fromCache` → `StaleStamp` where states.md asks for it, plus `useConnectivity().status === "offline"` → `NeedsConnection` on server-only actions. Rows whose `pendingSync` is true show `SyncGlyph`.

### Routes

| Screen        | Paths                                                                             | Builder                  | Model               |
| ------------- | --------------------------------------------------------------------------------- | ------------------------ | ------------------- |
| today         | `/today` (`?item=`)                                                               | `buildTodayModel`        | `TodayModel`        |
| job-detail    | `/jobs`, `/jobs/$jobId`                                                           | `buildJobDetailModel`    | `JobDetailModel`    |
| cv-editor     | `/cvs`, `/cvs/$cvId`                                                              | `buildCvEditorModel`     | `CvEditorModel`     |
| tracker-board | `/tracker` (`?applicationId=`)                                                    | `buildTrackerBoardModel` | `TrackerBoardModel` |
| mail-review   | `/mail`, `/mail/review/$messageId` (`?folder=review\|updates\|all`, `?category=`) | `buildMailReviewModel`   | `MailReviewModel`   |

Every builder has the signature `(data: UserData, ctx: ModelContext, params) => Model`. It is pure (the clock and locale come from `ctx`) and is unit-tested against `populatedDataset` and `emptyDataset`. Read the JSDoc in each `model.ts` for its fields and copy. Summary:

- **Today:** `title`, `dateLabel` (no greeting, U8), `sections` (fixed order; empty ones omitted; plain-text `countLabel`), `items` (flattened for J/K; a union on `kind`: interview · review · autoUpdate · followUp · deadline · match, ids `<kind>:<docId>`), `selectedId`, `doneToday`, `agenda` (the 7-day rail), `firstUse.connectMail` / `findJobs`, `caughtUp`.
- **Job detail:** `list` (rows ranked by band, `countLabel`, `empty`), `selectedJobId`, `noSelection`, `detail` (header, facts, `match` pending / noCv / ready with requirements, skills, gaps, AI summary, description paragraphs + `descriptionCollapsedLines`, `sources`, `apply` route and offline reason, `application: ApplicationSummaryVM`, `submitPrompt`, `delisted`, `hidden`).
- **CV editor:** `firstUse` (two choice cards), `list` (base CVs with their variants, archived), `selectedCvId`, `editor` (variant banner, `saveStatus`, `sections` header / text / list with items and ghost rows, `personalDetails` (U6), `revisions` by day, `preview`, `pinnedApplications`, `originalFile`).
- **Tracker board:** `columns` (7 active stages, cards with age, staleness, auto glyph, next action, move targets), `closedRail` ("Not selected" and "No response" labels), `nudges`, `selected` (record header with "n of N", summary, timeline, moves with D16 reasons), `firstUse`.
- **Mail review:** `folders`, `categories`, `accounts` (health), `folder`, `rows` (review / update / plain / bundle), `selectedMessageId`, `selected` (proposal, body, retention line, recent activity, details rail), `noSelection`, `empty` (noAccount / caughtUp / …), `reauth`, `lastChecked`, `copy`.

Shared blocks (`shared/model/blocks.ts`), built once in `build-blocks.ts` so every screen words them the same: `ReviewProposalVM` (Today + Mail), `AutoChangeVM` (Today + Mail Updates), `NudgeVM` (Today + Tracker), `TimelineEventVM` (Tracker + Mail activity), `ApplicationSummaryVM` (Job detail + Tracker), `StatusMoveVM` and `UndoVM`. Atoms (`types.ts`): `TimeVM { iso, label, absolute }`, `StatusVM`, `CompanyVM`, `SourceVM`, `MatchVM`. Vocabulary (`vocabulary.ts`): `STATUS_MESSAGES` (rejected → "Not selected", ghosted → "No response"), `MATCH_BAND_PILL_MESSAGES`, `MOVE_DENIAL_MESSAGES`, and `MAIL_CATEGORY_MESSAGES` in `build-blocks.ts` (rejection → "Decision").

## Strings and languages

Every user-facing string goes through react-intl (ICU MessageFormat). No hard-coded copy in views or models.

- **Language:** the OS locale from the shell (`sys-locale` in `src-tauri/src/window.rs` → `__BFHR_CHROME__.locale`), then the browser languages, mapped to `en` / `tr` / `de` with English as the fallback (`src/i18n/locale.ts`). The formatting locale is the OS tag when its language matches ("de-AT"), else `en-GB` / `tr-TR` / `de-DE`. In the design build, `?locale=tr` overrides it (reload to switch); the harness takes `--locale tr`.
- **Catalogs:** `src/i18n/{en,tr,de}.json`, flat `id → message`.
  - `en.json` is generated from the code's `defaultMessage`s (`pnpm --filter @bfhr/desktop i18n:extract`). Never edit it by hand.
  - `tr.json` and `de.json` are hand-translated. TR uses formal **siz**, DE uses informal **du** (decisions.md U1). Missing keys fall back to English at runtime.
- **Convention:** one module-level `const messages = defineMessages({ key: { id: "<area>.<module>.<key>", defaultMessage: "…", description?: "…" } })` per file.
  - Areas: your screen id, or `shared`, `shell`, `design`.
  - Literal ids and messages only (the extractor reads them statically).
- **Where messages are formatted:**
  - Views: `useIntl().formatMessage(messages.key, values)`, or `<FormattedMessage>` for rich text.
  - Builders: `ctx.intl.formatMessage(…)`. `ModelContext.intl` is the app's `IntlShape`, `ctx.locale` its tag.
  - Shared vocabulary: `statusVM(status, intl)`, `matchVM(score, intl)`, `sourceVM(kind, intl, label?)`, plus `STATUS_MESSAGES`, `PHASE_MESSAGES`, `MATCH_BAND_*_MESSAGES`, `SOURCE_MESSAGES`, `MOVE_DENIAL_MESSAGES`, `MAIL_CATEGORY_MESSAGES` and `CHANNEL_MESSAGES` (`src/shared/model/vocabulary.ts`, `build-blocks.ts`).
- **Whole sentences only:** use arguments (`{company}`), plurals (`{count, plural, one {# application} other {# applications}}`) and `select`. Never concatenate fragments or pick plural forms in code. Turkish: keep case suffixes off placeholders (states.md "TR placeholder suffixes"). Dates and numbers come from `format.ts` and are passed in as arguments.
- **Data stays data:** company, people, role, subject and CV content are never translated.
- **When you add strings:** run `pnpm --filter @bfhr/desktop i18n:extract`, add the same ids to `tr.json` and `de.json`, then run `pnpm --filter @bfhr/desktop i18n:check`.
  - The check is part of `pnpm test`. It fails when `en.json` is missing or stale against the code, when a message isn't valid ICU, when tr/de have unknown ids, or when their `{arguments}` differ from English.
  - It reports untranslated ids; `--strict` makes them fail.
  - Ship your screen with zero untranslated ids.
- **Tests:** `fixtureContext(data, pendingWrites?, intl?)` defaults to English (en-GB). Pass `createAppIntl({ language: "tr", locale: "tr-TR" })` to test Turkish.

## Design build and state forcing

`pnpm --filter @bfhr/desktop dev:design` serves the design build at <http://localhost:5173/#/design>. That index links every screen × state. Add `&theme=dark` to override the system appearance, and `&platform=windows|macos` to pick the chrome in a plain browser.

| State     | Search params        | What you must render                                                                                                                                                    |
| --------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| populated | `?fixture=populated` | Deniz mid-search (`@bfhr/fixtures` `populatedDataset`)                                                                                                                  |
| empty     | `?fixture=empty`     | Right after onboarding: no CVs, jobs, applications or mail accounts                                                                                                     |
| loading   | `?state=loading`     | Cold load, nothing cached (skeletons after 300 ms, kept for at least 500 ms)                                                                                            |
| error     | `?state=error`       | Load failed, nothing cached (`model.retry()` goes back to ready)                                                                                                        |
| offline   | `?state=offline`     | Cached populated data (`fromCache`, "Updated 10:05"). The 28 px strip and sidebar "2 changes waiting to sync" come from the shell; two of your rows carry `pendingSync` |

`?state=` combines with `?fixture=empty`, and `&locale=tr|de` switches the language (a plain browser reads it at load). The design code and fixtures exist only when Vite runs in mode `design` / `design-e2e`: `__BFHR_DESIGN__` is a compile-time constant, so production builds keep the title-only shell. `pnpm --filter @bfhr/desktop check:bundle` builds production and fails if any of the 67 fixture strings (companies, names, emails, fixture ids) appear. Running the same script on a design build with `--expect-fixtures` is the control: it shows the check can see them.

## Capture

| Command                                                                                                                                                                                         | Output                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm --filter @bfhr/desktop capture:design <screen…\|all> [--states populated,empty] [--engines webkit,chromium] [--themes light,dark] [--sizes 1280x800,1920x1080] [--scale 2] [--locale tr]` | `artifacts/screens/desktop/harness/<webkit\|chromium>/[tr\|de/]<screen>-<state>-<theme>-<w>x<h>.png` |
| `pnpm --filter @bfhr/desktop build:e2e:design`, then `capture:app:design` (narrow with `BFHR_SCREENS=today` and `BFHR_STATES=populated,offline`)                                                | `artifacts/screens/desktop/<macos\|windows>/design/<same name>`                                      |
| `pnpm --filter @bfhr/desktop capture:design <screen…\|all> --axe` (combines with every option above)                                                                                            | also `artifacts/a11y/desktop/[tr\|de/]<screen>-<state>-<theme>-<engine>.json`                        |

- The browser harness needs no Rust build. WebKit stands in for macOS WKWebView (macOS chrome) and Chromium for Windows WebView2 (Windows chrome). It runs the Vite dev server in design mode, waits for `html[data-design-ready]`, and fails if the page logs an error.
- Use it for every iteration round. Use the real-app capture for final rounds: on macOS, and on the Windows CI runner.
- Screen names are those in `src/design/matrix.ts` (the five ids plus `demo`). `artifacts/` is gitignored.
- **Accessibility (`--axe`):** runs axe-core through `@axe-core/playwright`, with the WCAG 2.1 A and AA tags (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`).
  - Coverage: every captured screen × state × theme in each engine, after the state has rendered (once per page, at the first size).
  - Output: the full axe result JSON per page, plus one summary line per page: `a11y today-offline-dark-webkit: 0 critical · 1 serious · 0 moderate · 0 minor · 1 needs review (color-contrast×1)`. The counts are violating nodes by impact.
  - Pass/fail: the run exits non-zero on any serious or critical violation. "Needs review" (axe `incomplete`, e.g. contrast it can't compute) never fails the run; check it by hand.
  - Run it before every critique round and fix what it finds. Quote its summary in the critique's accessibility section.

Critique: follow BRIEF §5 and kickoff "Mobbin + design-critique protocol". Save each round verbatim to `docs/design/critiques/desktop/<screen>/r<N>.md`, with a Resolution section and the capture paths it judged.

## Component catalogue (`src/shared/ui`)

Every prop has JSDoc in the source, and that source is the reference. The components use token classes only, are keyboard and screen-reader accessible, and follow reduced motion.

| File                                                                                                   | Exports and key props                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Button.tsx`                                                                                           | `Button { variant: primary\|secondary\|plain\|destructive; size: sm\|md\|lg (24/32/40); icon; loading; loadingLabel; disabledReason; shortcut; hint; asChild }` · `IconButton { icon; label; size: sm\|md; shortcut; disabledReason; pressed }`                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `Hint.tsx` · `Keycaps.tsx`                                                                             | `Hint { label; keys?; side? }` (tooltip, 500 ms) · `Keycaps { keys: "Mod+K" \| ["Mod+/","?"]; tone? }` (⌘ vs Ctrl, spoken label)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `ScreenTitle.tsx`                                                                                      | `ScreenTitle { title; documentTitle?; children? }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `StatusPill.tsx`                                                                                       | `StatusPill { status: StatusVM; size?; pendingSync? }` · `InteractiveStatusPill { …; onSelect(to); open?; onOpenChange? }` · `StatusMenu { current; onSelect }` (targets from `canTransition`, D16 reasons)                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `MatchBand.tsx`                                                                                        | `MatchBandPill { match; showScore? }` · `MatchBandBar { match }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `Company.tsx`                                                                                          | `Monogram { company; size?; badge? }` · `CompanyChip { company; size? }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `RelativeTimeChip.tsx` · `SourceTag.tsx` · `ConfidenceTag.tsx` · `AiBadge.tsx`                         | `RelativeTimeChip { time; prefix? }` · `SourceTag { source }` · `ConfidenceTag { state; reason? }` · `AiBadge`, `AiDisclosureLine { text? }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `Chip.tsx` · `SegmentedControl.tsx`                                                                    | `Chip { selected; onSelectedChange; count?; disabledReason? }` · `SegmentedControl { label; options; value; onValueChange; size? }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `Menu.tsx` · `SnoozeMenu.tsx` · `ExportButton.tsx`                                                     | `MenuContent`, `ContextMenuContent`, `MenuItem { icon; shortcut; destructive; disabledReason; onSelect }`, `MenuRadioGroup`, `MenuRadioItem`, `MenuLabel`, `MenuSeparator` · `SnoozeMenu { trigger; onSnooze(preset); open?; onOpenChange? }` (presets 1–4, D19) · `ExportButton { formats; onExport; exporting?; disabledReason? }` (registers Mod+E)                                                                                                                                                                                                                                                                                                                   |
| `Toast.tsx`                                                                                            | `ToastProvider` + `ToastViewport` (mounted by AppShell; bottom-left of the content area, D12) · `useToast().show({ variant: undo\|info\|undoSend; message; action?: { label, run, keys? }; glyph?; sendAt?; sendNow?; openAfterUndo?; extended? })`. One toast at a time, 6 s / 10 s, pauses on hover/focus, Mod+Z undo history, "Restored · Open", F6 focuses it                                                                                                                                                                                                                                                                                                        |
| `InlineAlert.tsx` · `PaneError.tsx`                                                                    | `InlineAlert { tone: info\|warning\|error; title; children?; action?; onDismiss?; fromAction? }` · `PaneError { title; body; onRetry?; secondary?; details?; glyph? }` (focus moves to Try again)                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `EmptyState.tsx`                                                                                       | `EmptyState { kind: firstUse\|noResults\|caughtUp\|subArea; glyph?; title?; body; primary?; secondary? }` · `GhostRow { label; onClick }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `Skeleton.tsx`                                                                                         | `SkeletonRegion { loading; label; skeleton; children }` (300 ms delay, 500 ms minimum, `aria-busy`), `useSkeletonGate`, `SkeletonText` / `Block` / `Circle`, `AttentionRowSkeleton`, `JobRowSkeleton`, `JobDetailSkeleton`, `BoardCardSkeleton`, `MailRowSkeleton`, `CvFormSkeleton`, `CvPreviewSkeleton`, `TableRowSkeleton`                                                                                                                                                                                                                                                                                                                                            |
| `ProgressNote.tsx`                                                                                     | `ProgressNote { label; steps?; startedAt? }` (adds "This can take up to a minute…" after 10 s)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `ConnectionBanner.tsx` · `SyncStatus.tsx` · `SyncGlyph.tsx` · `StaleStamp.tsx` · `NeedsConnection.tsx` | Strip (shell) · `SyncStatus variant="sidebar"` (shell) or `variant="editor" { state; savedAt?; onRetry? }` · `SyncGlyph` ("Waiting to sync") · `StaleStamp { prefix: Updated\|Last checked; time; clock }` · `NeedsConnection { explanation?; children(reason) }`                                                                                                                                                                                                                                                                                                                                                                                                        |
| `ProposalSentence.tsx`                                                                                 | `ProposalSentence { move; mode: question\|statement }` · `ReasonLine { reason; source? }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `ReviewDetailPane.tsx`                                                                                 | `ReviewDetailPane { proposal; onConfirm; onChange; onNotJobMail; onReviewLater?; onOpenOriginal?; confirmDisabledReason?; offline?; headingLevel? }` (Today + Mail)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `AutoChangeRow.tsx` · `NudgeCard.tsx` · `TimelineRow.tsx`                                              | `AutoChangeRow { change; onUndo; onViewSource?; onAcknowledge?; acknowledged? }` · `NudgeCard { nudge; onPrimary; onSecondary; onSnooze?; snoozeOpen?; onSnoozeOpenChange? }` (controlled snooze menu for `H`) · `TimelineRow { event; onUndo?; onViewSource?; last? }` (inside an `<ol>`)                                                                                                                                                                                                                                                                                                                                                                               |
| `ApplicationSummaryBlock.tsx` · `SubmitPrompt.tsx`                                                     | `ApplicationSummaryBlock { summary; onOpenCv?; onOpenCoverLetter?; headingLevel? }` · `SubmitPrompt { company; variant: asking\|autoConfirmed; onYes; onNotYet; onNotApplying; onUndo?; confirmedBy? }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `SplitView.tsx`                                                                                        | `SplitView { listLabel; detailLabel; list; detail; detailOpen; onBack; backLabel; rail?; railLabel?; listPane? }`: list pane within `listPane` `{ min, default, max }` (default 340–440 px starting at 400; Mail passes 360–440 from 360, Today's centre column 420–720 from 480), resizable with ← / → on the splitter; detail ≥ 480, pushed below 980 with Back + Esc and focus handling; rail from 1440 · `DetailSidePanel { open; label; onClose; nav?; actions?; children }` (400–640 px, Esc, K / J inside, "3 of 12 in Interviewing")                                                                                                                             |
| `SidebarChildren.tsx`                                                                                  | `SidebarChildren { destination; label; children }` portals a screen's nested navigation under its active row in the shell sidebar (IA.md § Desktop "Shell": Jobs › Saved / searches / Hidden, Mail › folders / categories / accounts). It renders nothing while that section isn't active and is hidden in the < 640 px rail, where the screen must offer the same choices itself. `SidebarChildItem { current; onSelect; count?; trailing?; children }` is a 28 px indented row with `aria-current="page"`, a plain-text `count` (only Mail › To review, D01) and an optional `trailing` slot (health dot with its own text). The shell renders `SidebarChildrenOutlet` |
| `layout.ts` · `focus.ts`                                                                               | `useBreakpoints(): { compact <640, narrow <980, previewToggle <1100, detail ≥1200, wide ≥1440 }` (D04) · `useListNavigation({ containerRef, ids, activeId, onActivate, onOpen?, group?, enabled? })` → `itemProps(id)`, `focusItem(id)` (J / K / ↑ / ↓ / Enter, roving tabindex) · `useFocusOnMount(ref, when)` · `useReturnFocus(open)`                                                                                                                                                                                                                                                                                                                                 |

The demo at `#/design/demo` (`src/design/Demo.tsx`) uses most of these together. It renders Today's view-model as a plain list and is not Today's design.

## Keyboard

- Global ⌘ / Ctrl shortcuts, the ones the native menu mirrors, stay in `src/lib/shortcuts.ts` (Rust tests read it). Their alternates (`G T`, `G J`, `G R`, `G C`, `G M`, `?`) go through the keymap.
- Per-screen keys register while mounted, using IA.md's letters (C confirm, E done, H snooze, D not for me / not needed, M move / change, N not job mail, O open original, S save, A apply, 1–3 views, Mod+Enter primary). Write them with keymap syntax (`J`, `Mod+Shift+D`, `G T`, `?`):

  ```tsx
  useKeyBindings([
    { id: "mail.confirm", keys: "C", label: "Confirm", group: "Mail", enabled: canConfirm, run: confirm },
  ]);
  ```

- They appear in the shortcuts sheet automatically, grouped by `group`.
- Rules the registry enforces:
  - Single keys never fire in text fields or comboboxes (D28).
  - Nothing fires inside menus or modal dialogs unless `inOverlays` is set.
  - Unmodified Enter / Space on buttons and links keeps native activation unless you pass `when`.
  - The later registration wins, so panes override screens.
- Show the same keys in tooltips: the `shortcut` prop on `Button` / `IconButton`.

## Production vs design

|               | Production (`pnpm build`, `tauri build`)                       | Design (`dev:design`, `build:e2e:design`)               |
| ------------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| Routes        | Title-only shell for every path; `/design*` redirects to Today | Fixture-driven screens, `/design` index, `/design/demo` |
| Fixtures      | Absent (`check:bundle`)                                        | `@bfhr/fixtures` (devDependency)                        |
| Connectivity  | Online, no sync line (no data layer yet)                       | Forced by `?state`                                      |
| Plain browser | Refuses to start (no shell)                                    | Allowed (platform from `?platform` or the user agent)   |
