# iOS foundation (M0): the contract for screen work

Status: M0, 2026-10-22. How the five core iOS screens (Today, Job detail, CV editor, Tracker board, Mail review) are built, run in design mode, captured and critiqued. Design inputs: [IA.md](IA.md), [components.md](components.md), [system.md](system.md), [decisions.md](decisions.md), `research/<area>.md` and [research/states.md](research/states.md).

## Package layout

The SwiftUI layer lives in the Swift package `packages/swift/BFHRUI` (Swift tools 6.2, iOS 18, plus macOS 15 so `swift test` runs on the Mac). It depends on `BFHRCore` and `BFHRDesignTokens` only, **never on Firebase**, so screens build and test in seconds. The app target links `BFHRUI` (and `BFHRDesignTokens` for the root tint).

```
packages/swift/BFHRUI/
  Package.swift                    targets BFHRUI, BFHRUIFixtures, BFHRUITests; one string table per screen
  Sources/BFHRUIFixtures/          FixtureStore: packages/fixtures/conformance/{populated,empty}.json → FixtureDocument (#if DEBUG only)
  Sources/BFHRUI/
    Foundation/                    UserData, ScreenModel/LoadPhase/ConnectionState, ToastItem, shared row data, mutations, Strings, DateText
    Components/                    shared components (catalogue below)
    Resources/Localizable.xcstrings  shared strings (en, tr, de)
    Design/                        DesignScenario (launch arguments) + DesignScreenView (#if DEBUG only)
    Today/  JobDetail/  CVEditor/  TrackerBoard/  MailReview/
      <Screen>Model.swift          the view model (+ <Screen>Items.swift value types)
      <Screen>Screen.swift         the screen's view (M0 foundation: a plain data rendering, to be replaced)
      <Screen>Design.swift         DesignScenario.<screen>Model(): fixture selection for design mode
      <Screen>.xcstrings           the screen's string table (table name = folder name)
  Tests/BFHRUITests/               Swift Testing: Foundation, StringCatalog, <Screen>ModelTests
apps/ios/BruteForceHR/
  RootView.swift                   tabs, ToastCenter, tint; DEBUG hook into design mode
  DesignMode.swift                 #if DEBUG: tab ↔ screen mapping, DesignTabRoot
```

Concurrency: the package uses the app's model, default `MainActor` isolation with approachable concurrency (`defaultIsolation(MainActor.self)`, `NonisolatedNonsendingByDefault`, `InferIsolatedConformances`). Don't add `@MainActor`; never use `nonisolated(unsafe)`.

macOS compile rule: `BFHRUI` must also compile for macOS (that's how `swift test` runs). Use the shims in `Components/PlatformShims.swift` (`bfhrInsetGroupedList()`, `bfhrLargeTitle()`, `bfhrInlineTitle()`, `ToolbarItemPlacement.bfhrTrailing` / `.bfhrLeading` / `.bfhrBottomBar`) and put any other iOS-only API (`UIViewRepresentable`, `keyboardType`, `EditButton`, `fullScreenCover`, `UIPasteboard`) behind `#if os(iOS)`.

## Data honesty

- Design mode is **Debug-only**. `BFHRUIFixtures`, `Design/` and `apps/ios/BruteForceHR/DesignMode.swift` are wrapped in `#if DEBUG`; the build phase "Copy design fixtures (Debug only)" copies the fixture JSON into `BFHRFixtures/` of Debug app bundles only. Release builds keep the title-only shell, compile no fixture code and bundle no fixture data (verification commands below).
- Screens never import `BFHRUIFixtures`. They get a `UserData` through their model's `load(_:)`; design mode and previews fill it from fixtures, and later milestones fill it from Firestore.

## The view-model contract

Every screen model is an `@Observable final class` conforming to `ScreenModel` (`Foundation/ScreenStatus.swift`):

| Member                        | Meaning                                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `phase: LoadPhase`            | `.loading` (cold, nothing cached → skeleton), `.failed(LoadFailure)` (nothing cached → `PaneError`), `.loaded` (cached data always wins; empty is a loaded state) |
| `connection: ConnectionState` | `.online`, `.offline(lastSyncedAt:)`, `.backOnline(syncedChanges:)` → `ConnectionBanner`, `StaleStamp`                                                            |
| `pendingSyncIDs: Set<String>` | rows changed offline → `SyncGlyph`; `recordWrite(id)` adds while offline                                                                                          |
| `load(_ data: UserData)`      | replaces the data, recomputes, sets `.loaded`                                                                                                                     |

Rules:

- Models expose typed data (dates, numbers, enums, ids), not formatted strings. Views format with `DateText` / `RelativeTimeText` and the labels in `Localization.swift`.
- Mutations are optimistic and go through `UserData+Mutations.swift` (`moveApplication`, `revertEvent`, `confirmReview`, `undoAutoChange`, `setReviewState`, `setMatchState`, `setCvArchived`), which follow BFHRCore's state machine: status moves only through `transition`, Undo only through `revert` (append-only events, D11). They return a `ToastItem`; the view calls `toastCenter.show(_:)`.
- Shared row data (`Foundation/SharedItems.swift`) keeps screens from drifting: `CompanyIdentity`, `AutoChangeItem` (`UserData.autoChanges(since:)`), `ReviewProposal` + `ReviewReason` (`reviewQueue()`), `NudgeItem` (`nudges(at:)`), `MoveTarget` (`moveTargets(for:)`), `TimelineEntry` (`timeline(for:)`).
- Each model takes `now` and `calendar` in its initializer; design mode passes the fixture's `now` (2026-10-22 07:30 UTC) so relative times are stable.

### Today — `TodayModel(now:calendar:)`

`sections: [Section]` (visible, fixed order: nextUp · toReview · followUps · deadlines · newMatches) · `nextUp: NextUp?` (interview within 48 h: company, role, title, kind, round, startsAt/endsAt, interviewer `timeZone`, meetingURL, people, prepNotes, `isJoinable` from 10 min before) · `toReview: [ReviewProposal]` + `toReviewCount` · `autoChanges: [AutoChangeItem]` (last 7 days, until acknowledged) · `followUps` / `olderFollowUps: [NudgeItem]` (≥ 14 days collapse) · `deadlines: [Deadline]` (assessment / replyBy / nextAction / jobCloses within 7 days) · `newMatches: [NewMatch]` (top 3 new, band + first reason) · `done: [DoneItem]` (until local midnight) · `isCaughtUp`, `showsConnectMailCard`, `hasMailAccount`, `accountNeedsAttention`, `profileName`.
Actions: `confirm(_:) throws -> ToastItem` · `acknowledge(_:)` · `undoAutoChange(_:) throws -> ToastItem` · `snooze(_:until:) -> ToastItem` · `notNeeded(_:) -> ToastItem` · `markDone(deadline:) -> ToastItem?` · `saveMatch(_:)` / `notForMe(_:) -> ToastItem` · `dismissConnectMailCard()`.

### Job detail — `JobDetailModel(jobId:now:calendar:)`

Missing job → `.failed(.notFound)`. `header: Header?` (title, company, locations, remoteType, remoteEligibility, employmentType, seniority, postedAt, salary + `SalaryProvenance`) · `match: MatchSummary` (`.pending` / `.noCV` / `.scored(ScoredMatch)`: score, band, basis CV, computedAt, requirement / skill / gap counts, `topReasons` (3), `topGaps` (2), full `reasons` / `gaps` / `requirements` as `Factor`, matched / unmatched skills, `rationale`) · `facts: [Fact]` (fixed order, `.notStated` values) · `description`, `hasDescription`, `isDelisted`, `originalPostingURL` · `sources: Sources` (`direct`, `boards`, `total`; per source: differing salary / title, `usedForApply`) · `applyRoute: ApplyRoute?` (`.email`, `.companySite`, `.board`, `.applied(date:applicationId:)`) · `applicationId`, `applicationStatus`, `isSaved`, `isHidden`, `hiddenReasons`, `canToggleSave`, `canHide`, `isPendingSync`.
Actions: `toggleSave() -> ToastItem?` (unsave is silent) · `hide(reasons:) -> ToastItem?` · `unhide()` · `markHaveSkill(_:) -> ToastItem?`.
Design: populated → `job-lighthouse-senior-frontend` (rationale, a gap, 3 sources); empty → that job stripped to no description and no match.

### CV editor — `CVEditorModel(selectedCvId:now:calendar:)`

List: `groups: [CVListGroup]` (base + variants, `CVVariantKind` role / language), `filter: CVListFilter`, `isEmpty` (→ Import a CV / Start from scratch), `archivedCount`. Selected CV: `document: CVDocument?` (title, language, variant info with `baseChangedSections`, template, theme, content, importedFrom, `hasLocalEdits`) · `sections: [CVSection]` (Header and Summary pinned, then `meta.sectionOrder`; `CVSectionSummary`, `items: [CVSectionItem]`, `isEmpty` → `GhostRow`) · `hiddenSections` · `revisionDays: [CVRevisionDay]` · `syncStatus: CVSyncStatus?` (`.saved(at:)`, `.saving`, `.savedOnDevice`, `.failed`) · `failedWriteIDs`.
Actions: `select(cvId:)` · `moveSection(from:to:)` · `removeItem(sectionKind:at:) -> ToastItem?` · `archive(cvId:) -> ToastItem?` · `unarchive(cvId:)`.
Design: populated → `cv-en` selected; empty → the list's empty state.

### Tracker board — `TrackerBoardModel(now:calendar:)`

`scope: PipelineScope` (active / closed / all) · `sections: [PipelineSection]` (every status of the scope, 0 rows included; `collapsedByDefault`) · `phaseGroups` · `stageStrip: [StageCount]` · `nudges: [NudgeItem]` · `isEmpty`. `PipelineRow`: company, role, status, daysInStage, nextDate, `secondLine: ApplicationNextStep` (`.interview`, `.nextAction`, `.stale(silentDays:)`, `.none`), `lastMoveAutomatic`, `pendingSync`.
Actions: `advanceTarget(for:)` · `moveTargets(for:)` · `outcomeTargets(for:)` · `move(_:to:) throws -> ToastItem` · `advance(_:) throws -> ToastItem?` · `close(_:outcome:) throws -> ToastItem` · `undo(eventId:) throws -> ToastItem` · `dismissNudge(_:) -> ToastItem` · `markNoResponse(_:) throws -> ToastItem` · `detail(for:) -> ApplicationDetail?` (header, `progress: [StageStep]`, nextStep, nudges, `timeline: [TimelineDay]`, interviews, contacts, cv / coverLetter refs).

### Mail review — `MailReviewModel(now:calendar:)`

Accounts: `accounts: [MailAccountItem]`, `accountFilter`, `hasAccounts` (no account → connect card), `showsAccountDot`, `needsAttention` (→ non-dismissible Reconnect alert), `lastChecked`. Chips: `filter: MailFilter` (`.toReview`, `.updates`, `.allJobMail(category:)`; defaults to To review when it has items), `counts`, `categoryCounts`, `badgeCount` (the Mail tab badge). Lists: `toReview: [ReviewProposal]`, `updates: [AutoChangeItem]` (14 days, from email), `allJobMail: [MailListItem]` (`.message(MailRow)` / `.jobAlerts(JobAlertBundle)`). Review sheet: `draft: ReviewDraft?` (drives `.sheet(item:)`), `beginReview(_:)`, `endReview()`, `reviewing`, `canConfirm`, `categoryOptions`, `applicationOptions`, `statusTargets`.
Actions: `confirm(_:draft:) throws -> ToastItem` · `markNotJobMail(_:) throws -> ToastItem` · `reviewLater(_:)` · `undoUpdate(_:) throws -> ToastItem` (reopens the email as a draft) · `markAllUpdatesSeen()`.

## Component catalogue

All components use `BFHRDesignTokens` only (no raw colors), scale with Dynamic Type (`Font.bfhr`, `@ScaledMetric`), carry VoiceOver labels / actions, and follow Reduce Motion through `BFHRMotion`. Source: `Sources/BFHRUI/Components/`.

| Component (components.md name)                              | API                                                                                                                                                                                                                          | Notes                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button / IconButton                                         | `.buttonStyle(.bfhrPrimary / .bfhrSecondary / .bfhrPlain / .bfhrDestructive)`, `.bfhr(_:fullWidth:)`, `ButtonPair { primary } secondary: { … }`, `IconButton(_:systemImage:action:)`                                         | ≥ 44 pt; `ButtonPair` stacks when labels don't fit (DE). Prefer layouts over `ViewThatFits` for text that must stay put: switching branches when the text size changes makes the accessibility audit report "Dynamic Type partially unsupported"           |
| Menu / ContextMenu, swipe actions                           | `.bfhrRowActions([RowAction])` with edges `.leading` (primary positive), `.trailing`, `.menuOnly`                                                                                                                            | One list feeds both swipes, the context menu and the VoiceOver actions rotor; per-action `haptic`                                                                                                                                                          |
| Haptics                                                     | `.bfhrHaptic(.confirm, trigger:)`                                                                                                                                                                                            | Only confirm / dragTargetChange / reveal / error vibrate                                                                                                                                                                                                   |
| Chip                                                        | `Toggle(…).toggleStyle(.bfhrChip)` in `ChipFlow`                                                                                                                                                                             | ✓ when selected; wraps at AX sizes                                                                                                                                                                                                                         |
| Toast                                                       | `ToastCenter` (one per app, in the environment), `.bfhrToastHost()`, `ToastItem`, `ToastAction.undo { }`, `ToastGlyph`                                                                                                       | 6 s / 10 s rule, announced, after Undo "Restored" (+ Open), full-width action at AX / VoiceOver; put the host inside a sticky bar's `safeAreaInset` content                                                                                                |
| InlineAlert                                                 | `InlineAlert(.info / .warning / .error, title:message:actionTitle:action:onDismiss:)`                                                                                                                                        | No dismiss for broken accounts; the ✕ sits in the top-trailing corner and only the title makes room for it; at AX sizes the glyph moves above the text so the text gets the full width                                                                     |
| PaneError                                                   | `PaneError(failure, title:message:retry: reload, goBack:)` with `@Environment(\.bfhrReload) private var reload`                                                                                                              | Try again takes VoiceOver focus; not-found offers navigation only; "Copy details" for `failure.details`. `reload` nil → no Try again; design mode replays the scenario (skeleton, then the data). Scrolls instead of truncating at AX sizes                |
| EmptyState / GhostRow                                       | `EmptyState(.firstUse / .noResults / .caughtUp / .subArea, glyph:title:message:primary:secondary:)`, `GhostRow(_:action:)`                                                                                                   | firstUse / caughtUp use the `ContentUnavailableView` layout with BFHR colors (the system view failed the dark-mode contrast audit); no praise                                                                                                              |
| Skeleton                                                    | `PhaseContainer(phase, loadingLabel:) { content } skeleton: { … } failure: { PaneError(…) }`, `.bfhrSkeleton()`                                                                                                              | 300 ms delay, 500 ms minimum, shimmer off under Reduce Motion, busy label for VoiceOver; skeleton = the real row layout with placeholder text                                                                                                              |
| ProgressNote                                                | `ProgressNote(_:)`                                                                                                                                                                                                           | Adds the long-wait line after 10 s                                                                                                                                                                                                                         |
| ConnectionBanner / SyncGlyph / StaleStamp / NeedsConnection | `ConnectionBannerSection(model.connection)` as the first item of a `List` (or `ConnectionBanner(_:)` at the top of other content), `SyncGlyph()`, `StaleStamp(date, kind: .updated / .lastChecked)`, `NeedsConnectionNote()` | Neutral, `wifi.slash`, announced. A top `safeAreaInset` / `safeAreaBar` / overlay on the list hides the iOS 26 large title, so in M0 the banner scrolls with the content; pinning it is open for the screen designs                                        |
| SourceTag / AiBadge / AiDisclosureLine / ConfidenceTag      | `SourceTag(.cv / .email / .automatic(actor) / .user)`, `AiBadge(_:)`, `AiDisclosureLine()`, `ConfidenceTag(reason:)`                                                                                                         | Amber for "Needs a look", never red. Put a `SourceTag` next to other items in `ChipFlow`, not an `HStack`, so they wrap instead of squeezing the tag                                                                                                       |
| Label in a capsule or list row                              | `.labelStyle(.bfhrCompact)` (`CompactLabelStyle`)                                                                                                                                                                            | Icon + title with a 4 pt gap. The default style in an iOS 26 `List` row moves the title into the row's text column (wide gap); the shared tags already use it                                                                                              |
| CompanyChip / Monogram, AvatarButton                        | `CompanyMonogram(_:badge:)`, `CompanyChip(_:)`, `AvatarButton(name:needsAttention:action:)`                                                                                                                                  | `badge` = `MailCategory.glyph` for `ClassificationBadge`. In rows next to text pass `hidesAtAccessibilitySizes: true` (the circle would squeeze the text at AX sizes; the row names the company)                                                           |
| RelativeTimeChip                                            | `RelativeTimeText(date, style: .day / .dayAndTime / .time)`, `DateText`                                                                                                                                                      | Neutral; `.day` reads the full date to VoiceOver, the styles that show a time read what's shown; reads `\.bfhrNow`                                                                                                                                         |
| StatusPill / phase tones                                    | `StatusPill(status, size:isPendingSync:onTap:)`, `StatusHeader(status:count:)` / `(phase:count:)`, `ToneDot`, `ApplicationStatus.tone/.label`, `StatusPhase.tone/.label`                                                     | Rejected = "Not selected" (grey), ghosted = "No response"                                                                                                                                                                                                  |
| StatusMenu ("Move to…")                                     | `StatusMenu(model.moveTargets(for:)) { status in … }`                                                                                                                                                                        | Invalid targets disabled with the D16 reason; a reason shared by several rows shows once as the section footer (VoiceOver still hears it per row); sets an opaque grouped `presentationBackground` so the iOS 26 glass sheet doesn't show the list beneath |
| MatchBandPill + MatchBandBar                                | `MatchBandPill(score:)`, `MatchBandBar(score:)`, `MatchBand.scoreCaption(_:)`                                                                                                                                                | Band first, "72 of 100" in detail, bar decorative; when the four segment labels don't fit (AX sizes, long translations) only the current band's label shows                                                                                                |
| AutoChangeRow                                               | `AutoChangeRow(item) { undo }`                                                                                                                                                                                               | Leads with the change ("Moved to Offer"), then company · role, then `item.reason` (the evidence sentence naming the source); "Can't undo" when superseded                                                                                                  |
| NudgeCard                                                   | `NudgeCard(item, now:onPrimary:onDismiss:)`                                                                                                                                                                                  | Follow-up / no response; never automatic                                                                                                                                                                                                                   |
| SnoozeMenu                                                  | `SnoozeMenu(now:onSnooze:onPickDate:) { label }`, `SnoozePreset`                                                                                                                                                             | Later today · Tomorrow · Next week · Pick a date…                                                                                                                                                                                                          |
| ProposalSentence + ReasonLine, ReviewSheet                  | `ProposalSentence(proposal)`, `ReasonLine(reason)`, `ReviewSheet(proposal, isOffline:onConfirm:onChange:onNotJobMail:)`                                                                                                      | Present with `.presentationDetents([.medium, .large])`; Confirm / Change… are pinned to the bottom so they show at the medium detent; correction pickers belong to the screen                                                                              |
| Timeline                                                    | `TimelineRow(entry, onUndo:onViewSource:)`, `TimelineDayHeader(day)`                                                                                                                                                         | Auto rows: reason, View source, Undo or "Can't undo"                                                                                                                                                                                                       |
| ApplicationSummaryBlock                                     | `ApplicationSummaryBlock(.init(status:channel:appliedAt:cvTitle:coverLetterTitle:), onStatusTap:)`                                                                                                                           |                                                                                                                                                                                                                                                            |
| SubmitPrompt                                                | `SubmitPrompt(company:onApplied:onNotYet:onNotApplying:)`                                                                                                                                                                    | `confirm` haptic on Yes                                                                                                                                                                                                                                    |
| TabBar badge                                                | `.bfhrTabBadge(model.badgeCount)` on the screen (`BFHRTabBadgeKey`); `RootView` applies `.badge(_:)` to that tab                                                                                                             | Mail's To review count only (IA.md); 0 hides it; nested reports take the largest value, they don't add up                                                                                                                                                  |
| SegmentedControl, Sheet, ConfirmDialog                      | native `Picker(.segmented)`, `.sheet` + detents, `.confirmationDialog`                                                                                                                                                       | No wrapper needed                                                                                                                                                                                                                                          |

Shared copy lives in `Strings` (Undo, Try again, statuses, "X · moved to Y", offline, AI disclaimer…); reuse it instead of re-adding a string.

Strings that interpolate user data (email addresses, domains, company names) render with `Text(bfhrPlain: resource)`: plain `Text(resource)` turns an address into an accent-colored `mailto:` link inside the sentence. The shared components already do this.

Navigation between tabs: open `bruteforcehr://…` links with `@Environment(\.openURL)` (IA.md "Deep links"). `RootView` handles them in-app (no round trip through the system) by selecting the link's tab; other schemes go to the system. Links only switch tabs in M0; pushing the linked item and the `settings` host (Settings sheet) land with those screens.

## Strings

- `LocalizedStringResource.bfhr("<screen>.<key>", default: "English", table: "<Screen>", comment: "…")`; `Text(resource)` renders it. Keys are semantic; the English default sits in code and in the catalog's `en` value.
- Add every key to `<Screen>/<Screen>.xcstrings` with `en`, `tr` (formal **siz**) and `de` (informal **du**), `"extractionState" : "manual"`. Use positional specifiers (`%1$@`, `%2$lld`) when there are two or more arguments. `StringCatalogTests` fails on any key missing a language or with mismatched specifiers.
- Status labels, "Not selected", "No response", band names and dates come from the shared helpers; never re-translate them per screen.

## Adding a screen (screen agents)

You own `packages/swift/BFHRUI/Sources/BFHRUI/<Screen>/**`, `Tests/BFHRUITests/<Screen>ModelTests.swift` and `docs/design/critiques/ios/<screen>/**`. Nothing else.

1. Replace `<Screen>Screen.swift` (the M0 data rendering) with the real design. Keep the public initializer `<Screen>Screen(model:)`; design mode, previews and the capture harness call it.
2. Wrap the content in `PhaseContainer(model.phase) { … } skeleton: { … } failure: { … }`, put `ConnectionBannerSection(model.connection)` first in the list and apply `.bfhrToastHost()`; read `ToastCenter` with `@Environment(ToastCenter.self) private var toasts: ToastCenter?`.
3. Extend the model in your folder when the design needs more data (with tests). Use the shared builders and mutations; don't duplicate them.
4. Render all five states: `populated`, `empty` (states.md's Empty column for your screen; adjust `<Screen>Design.swift` if the empty fixture needs a variant), `loading`, `error`, `offline`, in light and dark, at the default and the largest accessibility text size.
5. Run the package tests, build the app, capture, critique (below), iterate.

**Not yours** (ask the foundation owner or Main): `Package.swift`, `Foundation/`, `Components/`, `Design/`, `Resources/`, other screens' folders, `apps/ios/**`. If a shared component needs a change, message the owner with the API you need and keep a private helper in your folder until it lands. New shared copy goes through `Strings`.

## Design mode and launch arguments

Debug builds only. Any of these arguments turns design mode on; every tab then shows its core screen (Job detail is pushed over the Jobs root, with the real back button):

| Argument      | Values                                                                               | Default     |
| ------------- | ------------------------------------------------------------------------------------ | ----------- |
| `-BFHRDesign` | `populated`, `empty`                                                                 | `populated` |
| `-BFHRState`  | `loading`, `error`, `offline`                                                        | none        |
| `-BFHRScreen` | `today`, `job-detail`, `cv-editor`, `tracker-board`, `mail-review` (selects its tab) | Today       |

The capture state names map to `populated`, `empty` (`-BFHRDesign`) and `loading`, `error`, `offline` (`-BFHRState` on the populated data). In Xcode, add the arguments under Scheme › Run › Arguments; previews use `DesignScreenView(.today, scenario: DesignScenario(state: "offline")!)` with `.environment(ToastCenter())`.

## Build, test, capture

```sh
# View-model + catalog tests (macOS, seconds)
cd packages/swift/BFHRUI && swift test

# App (Debug, simulator) into this worktree's DerivedData
cd apps/ios && xcodebuild build -project BruteForceHR.xcodeproj -scheme BruteForceHR \
  -derivedDataPath build/DerivedData -destination 'platform=iOS Simulator,name=iPhone 17e' -quiet

# Captures: one screen × all five states × light/dark × both devices × default and AX sizes
apps/ios/scripts/capture.sh --screen today --size default --size ax
#   → artifacts/screens/ios/<device>/<screen>-<state>-<theme>[-ax].png
#   options: --state NAME (repeatable), --theme light|dark, --device NAME, --skip-build, --screen all
```

- DerivedData is per worktree (`apps/ios/build/DerivedData`, gitignored), so worktrees build in parallel. The simulators are shared: the capture step takes a machine-wide lock (`/tmp/bfhr-ios-capture.lock`) and waits for another worktree's capture to finish.
- Measured on this machine (M0, Xcode 26.6): the first app build in a fresh worktree compiles the Firebase SDK, about 1.5 min and 2.5 GB of DerivedData. After a one-line view change in `BFHRUI`: `xcodebuild build` 16.5 s, `build-for-testing` (what `capture.sh` runs) 25 s, `swift build` of the package 6 s. A capture of one screen × 5 states × 2 themes × 2 sizes × 2 devices takes about 8.5 min.
- A design capture waits until the screen's tab is selected and then for either the design root (`design.<screen>`, set by `DesignScreenView`) or the back button of a view the screen pushed over it, so screens that open a detail at launch (CV editor) capture without failing the run.
- Delete `apps/ios/build/` when your screen is done (disk is tight).

## Critique loop

Critiques follow BRIEF §5 and the kickoff protocol: read `skill://design-critique` (plus `accessibility-review`, `ux-copy`, `design-system` where relevant), critique the captures of all states, themes, devices and sizes, and save the output verbatim to `docs/design/critiques/ios/<screen>/r<N>.md` (`<screen>` = `today`, `job-detail`, `cv-editor`, `tracker-board`, `mail-review`; `r1`, `r2`, …) with a **Resolution** section listing what changed. Screenshots stay in `artifacts/` (gitignored); never commit Mobbin images.

## Release verification

```sh
cd apps/ios && xcodebuild build -project BruteForceHR.xcodeproj -scheme BruteForceHR -configuration Release \
  -derivedDataPath build/DerivedData -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO -quiet
app=build/DerivedData/Build/Products/Release-iphonesimulator/BruteForceHR.app
find "$app" -iname '*fixture*' -o -name 'populated.json' -o -name 'empty.json'             # nothing
strings "$app/BruteForceHR" | grep -E -- '-BFHRDesign|BFHRScreen|FixtureStore|BFHRFixtures|Lighthouse Learning|deniz\.aksoy'  # nothing
nm "$app/BruteForceHR" | grep -iE 'FixtureStore|DesignScenario|DesignScreenView|DesignTabRoot'                       # nothing
```

The fixture copy phase writes to `$(BFHR_DESIGN_FIXTURES_DIR)`, which is the app's `BFHRFixtures/` folder in Debug and a throwaway folder in DerivedSources in Release (script sandboxing stays on).
