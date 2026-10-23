# Design system

Status: M0, 2026-10-22. Source of truth: `packages/ui-tokens` (`@bfhr/ui-tokens`). This doc explains the tokens and the rules for using them and the shared components. The component list is in [components.md](components.md), IA in [IA.md](IA.md), and decisions in [decisions.md](decisions.md).

## Principles

1. **Calm.** Job hunting is stressful. One accent family, neutral surfaces, no alarming red for outcomes, no badges except the Mail review count, no celebration, no streaks.
2. **Trust is visible.** Every automatic change shows its source, its reason and Undo, using the same components everywhere (`SourceTag`, `ReasonLine`, `AutoChangeRow`, `Toast`).
3. **Platform-native behavior, one brand.** iOS is native SwiftUI: system colors where the HIG expects them, plus Dynamic Type, SF Symbols, sheets, swipe actions and haptics. Desktop is a Tauri webview (WKWebView on macOS, WebView2 on Windows), keyboard-first, with Segoe UI Variable on Windows and SF Pro on macOS. The colors, type ramp and spacing are the same everywhere.
4. **Consistency over creativity.** If a token or component exists, use it. Tailwind's default palette, type sizes, radii, shadows and easings are switched off, so `bg-red-500` and `text-sm` don't compile.
5. **Accessible by construction.** Every allowed color pairing is contrast-tested (WCAG 2.1 AA) in CI. Color never carries meaning alone. Every interactive element meets the hit-target minimums.

## Using the tokens

| Target                                   | How                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript (any app)                     | `import { color, textStyles, space, radius, elevation, duration, easing, timing, hitTarget, layout } from "@bfhr/ui-tokens";`                                                                                                                                                                                                                                                                                                                                 |
| CSS variables                            | Build once (`pnpm --filter @bfhr/ui-tokens build`), then `@import "@bfhr/ui-tokens/tokens.css";`. Every variable starts with `--bfhr-`.                                                                                                                                                                                                                                                                                                                       |
| Tailwind 4 (desktop webview UI, website) | `@import "tailwindcss";` then `@import "@bfhr/ui-tokens/tailwind.css";` (it imports `tokens.css` itself). Utilities: `bg-surface-base`, `text-fg-secondary`, `border-line-control`, `text-body`, `rounded-lg`, `shadow-overlay`, `ease-standard`, `p-3` (12 px).                                                                                                                                                                                              |
| SwiftUI (iOS)                            | Add the local package `packages/ui-tokens/swift/BFHRDesignTokens` (iOS 18 / macOS 15), then `import BFHRDesignTokens`. See "Swift package" below.                                                                                                                                                                                                                                                                                                             |
| Light / dark                             | CSS follows `prefers-color-scheme`. `data-theme="light"` or `"dark"` on any element overrides it for that subtree. Tailwind's `dark:` variant follows the same rule. In SwiftUI, system colors and the asset-catalog colors switch automatically, Increase Contrast included; `.bfhrElevation(_:)` picks the shadow for the current `colorScheme`.                                                                                                            |
| Reduced motion                           | CSS shortens durations and sets `--bfhr-motion-distance: 0px` under `prefers-reduced-motion: reduce`. In SwiftUI, read `@Environment(\.accessibilityReduceMotion)` and pass it to `BFHRMotion.animation(_:easing:reduceMotion:)`, `BFHRMotion.spring(reduceMotion:)`, `BFHRMotion.distance(reduceMotion:)` and `BFHRMotion.shimmer(reduceMotion:)`.                                                                                                           |
| Build order                              | `dist/` is generated and gitignored. Turbo's `build`, `lint`, `typecheck` and `test` depend on `^build`, so dependents get the CSS. A dev server that imports the CSS needs one `pnpm --filter @bfhr/ui-tokens build` first. The Swift package is generated but **committed** (Xcode reads it without Node): after changing `src/`, run `pnpm --filter @bfhr/ui-tokens generate:swift` and commit the result. `check:swift` and the test suite fail on drift. |

Each app checks once, at the type level, that `ApplicationStatus` (from `@bfhr/core`) and `StatusKey` (from `@bfhr/ui-tokens`) match. It fails to compile if either side gains or loses a status:

```ts
import type { ApplicationStatus } from "@bfhr/core";
import type { StatusKey } from "@bfhr/ui-tokens";
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const statusTokensMatchCore: Same<ApplicationStatus, StatusKey> = true;
```

In Swift, `BFHRStatus` and `BFHRPhase` use the core enum strings as raw values (`BFHRStatus(rawValue: "rejected")`), so the iOS app converts a BFHRCore status by its raw value, and a unit test over `allCases` should keep both lists equal.

### Swift package

`packages/ui-tokens/swift/BFHRDesignTokens` is written by `src/swift.ts`: `Package.swift`, `Sources/BFHRDesignTokens/Tokens.swift` and `Colors.xcassets` with one color set per token (same names as the CSS variables: `surface-canvas`, `status-offer-text`), each with light and dark values and, for the increased-contrast roles, `contrast: high` variants. Don't edit it by hand.

| API                                                                                                                                                                                                | What it gives you                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BFHRColor.background`, `.secondaryBackground`, `.tertiaryBackground`, `.groupedBackground` (+ secondary / tertiary), `.label`, `.separator`, `.opaqueSeparator`, `.fill` (+ secondary / tertiary) | iOS system colors (`UIColor.systemBackground`, `.label`, …), as the HIG expects for screens, grouped lists, primary text, separators and fills. Elevated sheet backgrounds and Increase Contrast come from iOS.                    |
| `BFHRColor.tint`                                                                                                                                                                                   | `Accent.text`; set once with `.tint(BFHRColor.tint)` at the app root.                                                                                                                                                              |
| `BFHRColor.Surface.*`, `.Fg.*`, `.Line.*`, `.Accent.*`, `.Danger.fill`, `.Chart.*`, `.Skeleton.*`, `.Toast.*`                                                                                      | Brand roles from the asset catalog. Use `Fg.secondary` / `Fg.tertiary` for secondary text (iOS `secondaryLabel` is ≈ 3.4:1 on white).                                                                                              |
| `BFHRTone.success` / `.warning` / `.danger` / `.info`, `BFHRTone.status(_:)`, `BFHRTone.phase(_:)`                                                                                                 | Tones (`text`, `subtle`, `solid`) for pills, dots and callouts.                                                                                                                                                                    |
| `BFHRTextStyle` + `Font.bfhr(_:emphasized:)`                                                                                                                                                       | The ramp below, as `Font.system(<Font.TextStyle>, weight:)`, so Dynamic Type scales it to AX5. `title1` → `.title`, `caption1` → `.caption`. `pointSize` / `lineHeight` are the default metrics, for `@ScaledMetric(relativeTo:)`. |
| `BFHRSpace.s0…s20`, `BFHRRadius.*` + `BFHRRadius.shape(_:)`, `BFHRBorderWidth.*`, `BFHRIconSize.*`, `BFHRHitTarget.minimum` (44)                                                                   | Scales in points; `shape(_:)` is a continuous-corner `RoundedRectangle`.                                                                                                                                                           |
| `BFHRElevation` + `.bfhrElevation(_:)`                                                                                                                                                             | Per-scheme shadows.                                                                                                                                                                                                                |
| `BFHRDuration`, `BFHREasing`, `BFHRMotion`                                                                                                                                                         | Durations, timing curves and the critically damped spring, each with its Reduce Motion variant.                                                                                                                                    |
| `BFHRTiming.*`, `BFHRHaptic.*.feedback`                                                                                                                                                            | Behavioral timings (seconds) and haptics as `SensoryFeedback` for `.sensoryFeedback(_:trigger:)`.                                                                                                                                  |

```swift
import BFHRDesignTokens

struct StatusPill: View {
    let status: BFHRStatus
    let label: LocalizedStringKey

    var body: some View {
        let tone = BFHRTone.status(status)
        Label { Text(label) } icon: { Circle().fill(tone.solid).frame(width: 8, height: 8) }
            .font(.bfhr(.footnote))
            .foregroundStyle(tone.text)
            .padding(.horizontal, BFHRSpace.s2)
            .background(tone.subtle, in: Capsule())
    }
}
```

`swift build` in the package folder compiles it for macOS; Xcode compiles the asset catalog when the iOS app builds.

## Color

All values are sRGB hex. `pnpm --filter @bfhr/ui-tokens test` checks every pairing listed under "Allowed pairings" for both schemes: on token surfaces, and for brand colors also on iOS system backgrounds (`#FFFFFF`, `#F2F2F7`, `#000000`, `#1C1C1E`, `#2C2C2E`).

**Palette.** One accent family, **teal-green** (the user's pick, decisions.md U5): OKLCH hue ≈ 188 at 85 % of the sRGB gamut's chroma, derived by keeping each role's WCAG luminance so every contrast relationship holds. Neutrals stay cool grey. Accepted and success keep a separate gentle green (hue ≈ 150), info stays blue (≈ 245), and closed outcomes stay neutral grey. In dark mode the accent fill sits in the narrow band where it shows ≥ 3:1 against every dark surface and white text on it keeps ≥ 4.5:1.

### Roles

| Group    | Token                                | Light                                         | Dark                                          | Use for                                                                                       |
| -------- | ------------------------------------ | --------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| surface  | `canvas`                             | `#F6F7F9`                                     | `#0E1014`                                     | Window / screen background behind panes and cards                                             |
|          | `base`                               | `#FFFFFF`                                     | `#16191F`                                     | Cards, panes, list rows, dialogs' content                                                     |
|          | `sunken`                             | `#EFF1F4`                                     | `#0A0C0F`                                     | Board column wells, inset inputs on cards, code / checksum blocks                             |
|          | `elevated`                           | `#FFFFFF`                                     | `#1E2229`                                     | Popovers, menus, dialogs, palette (always with an elevation shadow)                           |
|          | `hover`                              | `#EBEEF2`                                     | `#232730`                                     | Hovered row or control (desktop, website)                                                     |
|          | `selected`                           | `#E1F3F1`                                     | `#0D302D`                                     | Selected row, current list item, active filter background                                     |
|          | `scrim`                              | `#0E1014` @ 40 %                              | `#000000` @ 60 %                              | Modal backdrop only                                                                           |
| fg       | `primary`                            | `#161A22`                                     | `#ECEEF2`                                     | Titles, body text                                                                             |
|          | `secondary`                          | `#4B5261`                                     | `#A8AFBB`                                     | Supporting text, labels, metadata that matters                                                |
|          | `tertiary`                           | `#5E6573`                                     | `#8F97A4`                                     | Timestamps, captions, placeholders (still AA)                                                 |
|          | `disabled`                           | `#A0A6B0`                                     | `#5C6370`                                     | Disabled controls only (exempt from contrast, WCAG 1.4.3)                                     |
|          | `link`                               | `#1F635D`                                     | `#43BEB4`                                     | Inline links                                                                                  |
|          | `onAccent`, `onDanger`               | `#FFFFFF`                                     | `#FFFFFF`                                     | Text on `accent.solid` / `danger.fill`                                                        |
| line     | `subtle`                             | `#E1E4EA`                                     | `#2A2F38`                                     | Decorative dividers, card hairlines                                                           |
|          | `control`                            | `#7D8492`                                     | `#707887`                                     | Borders that identify a control: inputs, checkboxes, outlined buttons                         |
|          | `focus`                              | `#216863`                                     | `#43BEB4`                                     | Focus ring (2 px, 2 px offset)                                                                |
| accent   | `solid` / `hover` / `pressed`        | `#216863` / `#1B5954` / `#154B47`             | `#2B827B` / `#277972` / `#236E68`             | Primary button fill, switch on, progress, current step                                        |
|          | `subtle`                             | `#D3EFEC`                                     | `#0D302D`                                     | Selected chips, matched-skill chips, added text in diffs                                      |
|          | `text`                               | `#1F635D`                                     | `#43BEB4`                                     | Text buttons, icons, iOS tint                                                                 |
| success  | `text` / `subtle` / `solid`          | `#1B7B3C` / `#E0F7E4` / `#409A59`             | `#67AA76` / `#152D1A` / `#2D8949`             | Sent, connected, readback passed (never job outcomes)                                         |
| warning  |                                      | `#9C5D00` / `#FFEDD7` / `#BC7A19`             | `#C18C4C` / `#34220B` / `#A96800`             | Attention and uncertainty: "Needs a look", "Needs reconnecting", low-confidence import fields |
| danger   | `text` / `subtle` / `solid` / `fill` | `#BD3838` / `#FFE7E4` / `#E25B56` / `#BD3838` | `#E1756E` / `#3A1D1B` / `#CF4946` / `#CD4845` | Errors, "Can't connect", destructive actions. **Never for Rejected / Not selected.**          |
| info     |                                      | `#2870A5` / `#DDF3FF` / `#488EC5`             | `#689ECB` / `#12283B` / `#377DB4`             | Neutral notices, AI disclosure callouts                                                       |
| chart    | `series` / `neutral` / `grid`        | `#216863` / `#7D8492` / `#E1E4EA`             | `#38A29B` / `#707887` / `#2A2F38`             | Insights: one brand hue, grey for dropped off / waiting, decorative grid                      |
| skeleton | `base` / `highlight`                 | `#ECEEF2` / `#F5F6F8`                         | `#1E2229` / `#262B33`                         | Loading placeholders (shimmer only without reduced motion)                                    |
| toast    | `bg` / `text` / `action` / `border`  | `#1F232B` / `#F2F4F7` / `#79CDC5` / = bg      | `#2E333D` / `#F2F4F7` / `#79CDC5` / `#3A404B` | The dark snackbar in both schemes                                                             |

### Status and phase tones

Each tone has `text` (label and icon), `subtle` (pill background) and `solid` (dot, column accent, bar). This follows tracker.md: **one hue per phase**. Saturation rises from Applied to Offer. Closed outcomes are neutral grey, Accepted alone gets a gentle green, and **no red for a rejection**: `rejected` is labelled **"Not selected"** (decisions.md U2) and uses the Closed tone. Status meaning always comes from the label; the dot only supports it.

| Phase       | Statuses                                                   | Hue                | Light text / subtle / solid       | Dark text / subtle / solid        |
| ----------- | ---------------------------------------------------------- | ------------------ | --------------------------------- | --------------------------------- |
| Shortlist   | —                                                          | blue-grey          | `#596D7D` / `#DFF3FF` / `#768B9B` | `#899BA9` / `#182835` / `#667A8B` |
|             | saved                                                      |                    | `#636D77` / `#E7F2FC` / `#7E8993` | `#909AA2` / `#1F282F` / `#6E7983` |
|             | preparing                                                  |                    | `#536E82` / `#DEF4FF` / `#6F8CA0` | `#849CAE` / `#122938` / `#5F7B90` |
| In progress | —                                                          | accent (teal)      | `#39756F` / `#DDF5F2` / `#4A958E` | `#53A59E` / `#0D2A28` / `#40837D` |
|             | applied                                                    | low chroma         | `#52716E` / `#DDF5F2` / `#6A908C` | `#759F9B` / `#0D2A28` / `#5B7E7A` |
|             | acknowledged                                               |                    | `#47736F` / … / `#5B928D`         | `#65A39D` / … / `#50817D`         |
|             | screening                                                  |                    | `#39756F` / … / `#4A958E`         | `#53A59E` / … / `#40837D`         |
|             | interviewing                                               |                    | `#267670` / … / `#33968E`         | `#3AA79F` / … / `#2C857E`         |
|             | offer                                                      | high chroma        | `#007973` / … / `#009991`         | `#00AAA0` / … / `#00857E`         |
| Closed      | —                                                          | neutral            | `#686C70` / `#EDF1F5` / `#84888C` | `#95999C` / `#24272A` / `#74787C` |
|             | accepted                                                   | gentle green       | `#35794B` / `#E1F7E6` / `#539666` | `#6FA87E` / `#162C1C` / `#428557` |
|             | declined · rejected ("Not selected") · withdrawn · ghosted | neutral (= Closed) | same as Closed                    | same as Closed                    |

### Allowed pairings

The test defines these (`contrastPairs()` in `src/contrast.ts`). Anything not listed is not allowed in product UI.

| Foreground                                                                                                 | On                                                                          | Minimum             | Examples (measured)                                                                                    |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| `fg.primary`, `fg.secondary`, `fg.tertiary`, `fg.link`, `accent.text`                                      | every surface (`canvas`, `base`, `sunken`, `elevated`, `hover`, `selected`) | 4.5:1               | light `fg.secondary`/`base` 7.84, `fg.tertiary`/`sunken` 5.18; dark `fg.tertiary`/`elevated` 5.42      |
| `fg.onAccent`                                                                                              | `accent.solid`, `.hover`, `.pressed`                                        | 4.5:1               | light 6.51, dark 4.58 (pressed 6.00)                                                                   |
| `fg.onDanger`                                                                                              | `danger.fill`                                                               | 4.5:1               | —                                                                                                      |
| `fg.primary`, `accent.text`                                                                                | `accent.subtle`                                                             | 4.5:1               | `accent.text` light 5.77, dark 6.27                                                                    |
| tone `text` (feedback, phase, status)                                                                      | its own `subtle` and every surface                                          | 4.5:1               | light `status.rejected.text` on its pill 4.66; `status.offer.text` 4.62; `warning.text` 4.61           |
| tone `solid`, `line.control`, `line.focus`, `accent.solid`, `danger.fill`, `chart.series`, `chart.neutral` | every surface                                                               | 3:1 (UI, SC 1.4.11) | light `line.control`/`base` 3.76, `status.offer.solid`/`sunken` 3.11; dark `accent.solid`/`hover` 3.26 |
| `toast.text`, `toast.action`                                                                               | `toast.bg`                                                                  | 4.5:1               | `toast.action` light 8.51, dark 6.85                                                                   |

### Increased contrast (iOS / macOS)

`increasedContrast` in `src/color.ts` overrides a few roles when the user turns on Increase Contrast. They ship as `contrast: high` variants in the asset catalog (the CSS output doesn't use them). Backgrounds keep their values. `increasedContrastPairs()` tests them on every token surface and the iOS backgrounds:

| Token                          | Light                 | Dark                  | Minimum (measured)                                                                 |
| ------------------------------ | --------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| `fg.secondary` / `fg.tertiary` | `#3C424F` / `#474E5C` | `#C7CCD3` / `#B4BAC2` | 7:1, SC 1.4.6 (light `fg.secondary`/`base` 10.08, dark `fg.tertiary`/`hover` 7.65) |
| `fg.link`, `accent.text`       | `#19544F`             | `#49CCC2`             | 7:1, also on `accent.subtle` (light 7.15)                                          |
| `line.control`                 | `#626B7C`             | `#8E95A0`             | 4.5:1 (dark on `hover` 4.95)                                                       |
| `line.focus`                   | `#19544F`             | `#49CCC2`             | 4.5:1                                                                              |
| `line.subtle`                  | `#B7BECD`             | `#444C59`             | decorative; only has to be more visible than the default                           |

Not allowed:

- Tone text on another tone's subtle (an amber label on a blue pill).
- `fg.disabled` for anything the user must read.
- Text on `scrim`.
- Brand colors on photos.
- iOS `secondaryLabel` for body text (≈ 3.4:1 on white; use `BFHRColor.Fg.secondary`).

### Color rules

| ✅ Do                                               | ❌ Don't                                                      |
| --------------------------------------------------- | ------------------------------------------------------------- |
| Pair every status dot with its label (`StatusPill`) | Show status by color alone, or tint a whole column / card     |
| Use warning (amber) for uncertainty and attention   | Use danger for anything except errors and destructive actions |
| Show account problems as amber dot + text           | Red badges, red counts, red "overdue" chips                   |
| Use `accent.solid` for one primary action per view  | Several filled accent buttons competing in one view           |
| Use `surface.selected` + a focus ring for selection | Rely on the macOS / Windows accent color (D05)                |
| Use chart tokens in Insights                        | Reuse status hues in charts (insights.md)                     |

## Typography

Styles are named after iOS Dynamic Type styles. iOS values are Apple's default ("Large") sizes; in SwiftUI each style is the system font at its `Font.TextStyle` (`BFHRTextStyle`), so Dynamic Type scales it up to AX5. Desktop values are px, emitted as rem so zoom scales them. The website uses the desktop ramp plus four fluid marketing styles.

| Style         | iOS pt (size / line, weight)  | Desktop px (size / line, weight) | Family  | Use for                                                           |
| ------------- | ----------------------------- | -------------------------------- | ------- | ----------------------------------------------------------------- |
| `largeTitle`  | 34 / 41, 400 (700 emphasized) | 26 / 32, 600                     | display | Screen titles (iOS nav large title is native), wizard step titles |
| `title1`      | 28 / 34, 400 (700)            | 22 / 28, 600                     | display | Backfill headline, empty-state titles on wide panes               |
| `title2`      | 22 / 28, 400 (700)            | 18 / 24, 600                     | sans    | Job title in detail, section titles in panes                      |
| `title3`      | 20 / 25, 400 (600)            | 16 / 22, 600                     | sans    | Card titles, dialog titles                                        |
| `headline`    | 17 / 22, 600                  | 14 / 20, 600                     | sans    | Row titles, emphasized labels                                     |
| `body`        | 17 / 22, 400 (600)            | 14 / 20, 400                     | sans    | Default text                                                      |
| `callout`     | 16 / 21, 400 (600)            | 13 / 18, 400                     | sans    | Secondary lines in rows, button labels on desktop                 |
| `subheadline` | 15 / 20, 400 (600)            | 13 / 18, 400                     | sans    | Meta lines, sidebar labels                                        |
| `footnote`    | 13 / 18, 400 (600)            | 12 / 16, 400                     | sans    | Section footers, helper text, step labels                         |
| `caption1`    | 12 / 16, 400 (500)            | 12 / 16, 400                     | sans    | Timestamps, chips                                                 |
| `caption2`    | 11 / 13, 400 (600)            | 11 / 14, 500                     | sans    | Badges and keycaps only, never sentences                          |

| Marketing style (website) | 375 px → 1440 px  | Weight |
| ------------------------- | ----------------- | ------ |
| `display`                 | 36 / 44 → 56 / 64 | 600    |
| `section`                 | 26 / 32 → 36 / 44 | 600    |
| `lead`                    | 18 / 28 → 20 / 30 | 400    |
| `prose`                   | 16 / 26 → 17 / 28 | 400    |

Marketing style names never reuse a ramp name: both live in `--bfhr-text-*`, and the old marketing `headline` overwrote the desktop `headline` variables.

**Font stacks**

- `sans`: `-apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", system-ui, "Noto Sans", …`.
- `display`: the same with `"Segoe UI Variable Display"`.
- `mono`: `ui-monospace, "SF Mono", "Cascadia Mono", Consolas, …`.

iOS uses the system font (`Font.system(_:weight:)`; SF Pro picks Text / Display optical sizes). No web fonts are downloaded.

**Rules**

- Sentence case everywhere except macOS menu titles (HIG title case). No all-caps eyebrows: Turkish İ/I casing breaks them (website.md).
- Text wraps and never truncates labels that carry meaning: status names, buttons, counts. Only a subject or a long title may truncate, and it shows a tooltip. Budget DE +35–40 %, TR +25 %.
- Numbers in tables, counts and money use `font-variant-numeric: tabular-nums`. Dates and numbers always go through `Intl.*` (24 h in TR/DE).
- Mono is for checksums, keycaps, version numbers and website fact figures, never for body text.

## Spacing, size and shape

- **Grid:** 4 pt. Tokens `space[0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20]` = 0–80 px. In Tailwind, `--spacing` is 4 px, so `p-3` = 12 px. Half steps (`p-0.5`) are off-grid and only allowed for 1–2 px optical corrections inside icons.
- **Common spacings:**
  - Row padding: 12 × 16 (desktop), 11 × 16 (iOS list default).
  - Card padding: 16 (iOS) / 16–20 (desktop).
  - Gap between related controls: 8. Between groups: 24.
  - Page gutter: 20–24 (website at 375).
- **Radius:** `xs` 4 (checkbox, keycap) · `sm` 6 (dense chips, tooltips) · `md` 8 (buttons, inputs, menu items) · `lg` 12 (cards, popovers, toasts) · `xl` 16 (dialogs, sheets, palette) · `full` (pills, avatars, dots). On iOS, draw `lg` and `xl` with continuous corners (`BFHRRadius.shape(_:)`, i.e. `RoundedRectangle(style: .continuous)`), and `full` with `Capsule()`.
- **Borders:** `hairline` 0.5 px, `thin` 1, `thick` 2 (focus ring). Focus ring: 2 px `line.focus`, 2 px offset, never removed.
- **Hit targets:**
  - iOS: **44 pt** for everything tappable, including token ✕ and the toast's Undo.
  - Desktop: default control height **32 px** (`controlHeight.md`), never below **24 px** (WCAG 2.2 SC 2.5.8).
  - Website: **44 px** at touch breakpoints.
- **Icons:** 16 (desktop rows) · 20 · 24 (iOS rows, promise lists) · 28 (provider logos, option rows) · 48 (empty-state glyphs, max). iOS icons are SF Symbols, desktop icons are lucide (stroke 1.75).
- **Layout** (`layout` tokens): window minimum 480 × 360, sidebar 232 / rail 60, list pane 340–440, detail pane ≥ 480, side panel 400–640, board column 272 / collapsed 40, reading width 720. Breakpoints: `compact` 640, `narrow` 980, `preview` 1100, `detail` 1200, `wide` 1440 (D04).
- **Stacking** (`layer`): sticky 10 · modal 50 · popover 60 (menus open above dialogs) · toast 70 · palette 80 · tooltip 90. In Tailwind: `z-(--bfhr-layer-modal)`.

## Elevation

| Level     | Surface            | Use                               | Light              | Dark                     |
| --------- | ------------------ | --------------------------------- | ------------------ | ------------------------ |
| `raised`  | `surface.base`     | Hovered cards, sticky bars        | 1–3 px soft shadow | 1 px light ring + shadow |
| `overlay` | `surface.elevated` | Popovers, menus, toasts, tooltips | 12–16 px shadow    | ring + deeper shadow     |
| `modal`   | `surface.elevated` | Dialogs, palette, kit window      | 20–24 px shadow    | ring + 48 px shadow      |
| `drag`    | `surface.base`     | A lifted card or row              | 24 px shadow       | ring + 32 px shadow      |

Dark mode adds a 1 px `rgb(255 255 255 / 0.05–0.08)` ring because shadows barely show on dark canvases. Don't stack levels: a popover inside a dialog uses `overlay`, not a deeper shadow. On macOS the sidebar is vibrant and the content pane opaque. On Windows 11, Mica is on the shell only and panels stay opaque (job-detail.md, desktop-chrome.md).

## Motion

| Token                   | Value                             | Use                                                                                                                    |
| ----------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `duration.fast`         | 120 ms                            | Hover, press, color changes, toggles                                                                                   |
| `duration.base`         | 200 ms                            | Popovers, toasts entering, row expand                                                                                  |
| `duration.slow`         | 300 ms                            | Panels, the backfill cross-fade, the board drop settle                                                                 |
| `duration.slower`       | 400 ms                            | Sheets and large panel transitions (desktop; iOS sheets are native)                                                    |
| `easing.standard`       | cubic-bezier(0.2, 0, 0, 1)        | Most transitions                                                                                                       |
| `easing.enter` / `exit` | (0, 0, 0, 1) / (0.3, 0, 1, 1)     | Elements entering / leaving                                                                                            |
| `spring.standard`       | damping 35, stiffness 300, mass 1 | iOS drags and gesture-driven motion (critically damped, no overshoot): `.interpolatingSpring(mass:stiffness:damping:)` |
| `motionDistance`        | 8 px                              | Slide distance for toasts, popovers, arriving rows                                                                     |

**Reduced motion:**

- Every move becomes a cross-fade: `fast` = 0 and the rest 100 ms, with movement 0. On iOS the spring becomes a 100 ms ease-in-out (`BFHRMotion.spring(reduceMotion: true)`).
- Skeleton shimmer, scroll-driven website chapters and the job-source chip physics turn off.
- The sign-in check animation becomes a fade.

**Rules**

- Motion explains a change of place (a card moving, a sheet arriving). It never decorates.
- No count-ups, confetti, pulsing badges or animated score gauges.

**Haptics (iOS, `BFHRHaptic` → SwiftUI `.sensoryFeedback`):**

- Light impact on confirm, save and mark applied.
- Selection tick when a drag target changes.
- Light impact on the chart value callout.
- Error notification for a wrong code or a failed send.
- Dismissals, hides and rejections stay silent.

## Timing

`timing` tokens, shared by every client:

| Token                           | Value                                                  |
| ------------------------------- | ------------------------------------------------------ |
| `toast`                         | 6 s                                                    |
| `toastExtended`                 | 10 s (screen reader on, text > 60 chars, bulk actions) |
| `skeletonDelay` / `skeletonMin` | 300 ms / 500 ms                                        |
| `offlineDebounce`               | 2 s                                                    |
| `backOnline`                    | 3 s                                                    |
| `longWait`                      | 10 s ("This can take up to a minute…")                 |
| `arrivalHighlight`              | 2 s                                                    |
| `tooltipDelay`                  | 500 ms                                                 |

Email send uses the server's `sendAt`, not a client constant (D11).

## Patterns

### Feedback: which surface to use

| Situation                                                                                              | Component                                                                   | Never                                                                       |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| An action the user just took, or an automatic change while the app is open                             | `Toast` (Undo or one action)                                                | A modal "Are you sure?" for reversible actions (Undo replaces confirmation) |
| Something about the current view (stale data, section failed, account needs reconnecting, CV conflict) | `InlineAlert` above the affected content                                    | A blocking alert                                                            |
| A whole pane can't load and nothing is cached                                                          | `PaneError` (Try again gets focus)                                          | Hiding the chrome                                                           |
| Irreversible or destructive (send, disconnect and delete, delete account, restore)                     | `ConfirmDialog` with the safe action focused                                | Red primary fills outside the dialog                                        |
| Offline                                                                                                | `ConnectionBanner` + `SyncGlyph` + `NeedsConnection` on server-only actions | Hiding actions                                                              |
| Waiting on AI or the server                                                                            | `ProgressNote` that names the work                                          | Fake percentages, spinners without words                                    |

### Empty states

There are four kinds:

- **first use:** a ≤ 48 pt glyph, a title, one line, one primary action and an optional secondary.
- **no results:** text only, filters stay visible, "Clear filters".
- **caught up:** says what will arrive here, with no praise.
- **sub-area:** one muted line or a `GhostRow`.

Glyphs are monochrome line icons from the icon set. No mascots or scenes.

### Forms

- Settings save immediately (no Save buttons) and show an inline "Saved" or "Couldn't save · Try again".
- Editors autosave and show `SyncStatus`.
- Errors show icon + text + `line` border in `danger`. There are no live red errors while the user is typing; validate on blur or submit.
- Only what's needed is required. Skipped preferences mean "no filter".
- Long forms (preferences, IMAP) use grouped sections. On desktop: a label column of 200 px and a control column of 360 px.

### Navigation

- iOS: tabs for destinations, push for hierarchy, sheets for focused tasks. The avatar opens Settings.
- Desktop: the sidebar for destinations, panes for hierarchy, the docked Apply panel and dialogs for focused tasks, and the palette for everything (IA.md).
- Back / Esc always returns to where the user came from, and list selection and scroll position are kept.

### Data display

- Lists are virtualized on desktop (TanStack Virtual) and native lists on iOS.
- Tables (Tracker Table, backfill, Insights breakdown) use TanStack Table with sticky headers, sortable columns and keyboard selection.
- Scores show as **bands** in lists and "72 of 100" in detail. Never "%", decimals or a hero gauge.
- Relative times are neutral, with the absolute time in the tooltip or accessibility label.

## Component reference (core)

The components every core screen uses, documented in full. The rest follow the same structure in components.md.

### Button

| Variant                                                                                   | Use when                                                                             |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Primary (`accent.solid` / `fg.onAccent`)                                                  | The one main action of a view or dialog: Apply, Confirm, Import n, Send to {address} |
| Secondary (`surface.base`, `line.control` border, `fg.primary`)                           | Alternatives next to the primary: Change…, Draft one, Keep original                  |
| Plain (text, `accent.text`)                                                               | Low-emphasis actions, toolbar actions, Skip for now                                  |
| Destructive (`danger.text` on `danger.subtle`; `danger.fill` only inside `ConfirmDialog`) | Disconnect and delete, Delete everything                                             |

| Property         | Type                                                   | Default       | Description                                                       |
| ---------------- | ------------------------------------------------------ | ------------- | ----------------------------------------------------------------- |
| `variant`        | `"primary" \| "secondary" \| "plain" \| "destructive"` | `"secondary"` | See above                                                         |
| `size`           | `"sm" \| "md" \| "lg"`                                 | `"md"`        | Desktop 24 / 32 / 40 px; iOS ≥ 44 pt in every size                |
| `loading`        | `boolean`                                              | `false`       | Keeps the width, shows a spinner + progressive label ("Sending…") |
| `disabledReason` | `string`                                               | —             | Disabled buttons say why (tooltip on desktop, footnote on iOS)    |
| `shortcut`       | shortcut id                                            | —             | Shows `Keycaps` in the tooltip                                    |

| State           | Visual                                            | Behavior                                          |
| --------------- | ------------------------------------------------- | ------------------------------------------------- |
| Default         | Role colors above                                 | —                                                 |
| Hover (desktop) | `accent.hover` / `surface.hover`                  | `duration.fast`                                   |
| Pressed         | `accent.pressed` / darker hover                   | —                                                 |
| Focus           | 2 px `line.focus` ring, 2 px offset               | Visible on keyboard focus only (`:focus-visible`) |
| Disabled        | `fg.disabled` label, no fill change for secondary | Not focusable in groups; reason announced         |
| Loading         | Spinner + label                                   | Ignores repeat presses                            |

**Accessibility:** role `button`. Enter and Space activate it. The accessible name is the visible label; icon-only buttons need `aria-label` / SwiftUI `.accessibilityLabel(_:)`. Labels never have fixed widths. On iOS, paired buttons stack when either label exceeds half the width (DE), via `ViewThatFits`.

| ✅ Do                                                     | ❌ Don't                               |
| --------------------------------------------------------- | -------------------------------------- |
| Name the outcome: "Send to jobs@acme.com", "Import 14"    | "OK", "Submit", "Yes"                  |
| One primary per view                                      | Two filled accent buttons side by side |
| Word the safe choice as the safe choice: "Keep connected" | "Cancel" next to a destructive action  |

### StatusPill

Shows an application status as a dot plus a label.

| Property      | Type           | Default | Description                                                                            |
| ------------- | -------------- | ------- | -------------------------------------------------------------------------------------- |
| `status`      | `StatusKey`    | —       | Picks the tone `color.status[status]` and the localized label                          |
| `interactive` | `boolean`      | `false` | Opens `StatusMenu` (desktop popover / iOS Move to… sheet)                              |
| `size`        | `"sm" \| "md"` | `"md"`  | `sm` for dense tables (`caption1`), `md` for rows (`footnote` iOS / `callout` desktop) |

| State                     | Visual                                                               | Behavior                                                                  |
| ------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Static                    | `subtle` background, `solid` dot (8 px), `text` label, radius `full` | —                                                                         |
| Interactive hover / focus | `surface.hover` ring / focus ring                                    | Enter or click opens the status menu with valid targets from `@bfhr/core` |
| Pending sync              | `SyncGlyph` after the label                                          | —                                                                         |

**Accessibility:** the label is the meaning. Screen readers hear "Status: Interviewing" (the interactive variant adds ", button, changes status"). The dot is `aria-hidden`.

| ✅ Do                                       | ❌ Don't                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| Use the shared status dictionary (EN/TR/DE) | Abbreviate or truncate status names (DE "Vorstellungsgespräch" must fit) |
| Show Rejected with the Closed neutral tone  | Use red or a strikethrough for closed outcomes                           |

### Toast

| Property  | Type                             | Default        | Description                                                |
| --------- | -------------------------------- | -------------- | ---------------------------------------------------------- |
| `variant` | `"undo" \| "undoSend" \| "info"` | `"undo"`       | `undoSend` counts down to `sendAt`, and ✕ means "send now" |
| `message` | `string`                         | —              | Object + past-tense result: "Acme · moved to Screening"    |
| `action`  | `{ label, run, shortcut? }`      | Undo           | One action: Undo, View, Edit, Why?                         |
| `glyph`   | SF Symbol / lucide name          | by action type | Clock = snoozed, arrow = moved, paper plane = sending      |

| State      | Visual                                                                                    | Behavior                                             |
| ---------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Visible    | `toast.bg`, `toast.text`, `toast.action` for the action, radius `lg`, `overlay` elevation | 6 s / 10 s (`timing`)                                |
| Paused     | Unchanged                                                                                 | Hover or focus stops the timer                       |
| Replaced   | A newer toast takes its place                                                             | The old action stays reachable via Mod+Z and history |
| After Undo | "Restored · Open"                                                                         | Never offers another Undo                            |

**Accessibility:** `role="status"` / `aria-live="polite"`, and an `AccessibilityNotification.Announcement` on iOS. The action is reachable by keyboard (desktop: the toast takes focus with F6; Mod+Z works without focusing it) and by the VoiceOver rotor. At AX text sizes or with VoiceOver, iOS shows a full-width Undo button.

| ✅ Do                                                                          | ❌ Don't                                                         |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| One toast, bottom-left of the content area (desktop) / above the tab bar (iOS) | Top toasts (they cover the nav bar, title bar or Dynamic Island) |
| Keep Undo available after the toast hides                                      | Treat the toast as the only way to undo                          |

### InlineAlert

| Variant   | Tone      | Use                                                                          |
| --------- | --------- | ---------------------------------------------------------------------------- |
| `info`    | `info`    | Stale data ("Updated 09:12"), AI disclosures                                 |
| `warning` | `warning` | Needs reconnecting, a rejected queued write, partial success, low confidence |
| `error`   | `danger`  | Section failed to load, save failed                                          |

Layout: icon + title + body + one action (+ optional dismiss). The surface is the tone's `subtle`, text is `fg.primary` and the title / icon use the tone's `text`. Use `role="status"` for info and warning, and `role="alert"` only for errors the user caused by acting. A broken mail account's alert can't be dismissed.

### EmptyState

| Property               | Type                                                   | Description                                                |
| ---------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| `kind`                 | `"firstUse" \| "noResults" \| "caughtUp" \| "subArea"` | See "Empty states"                                         |
| `glyph`                | icon name                                              | ≤ 48 pt, monochrome, `fg.tertiary`                         |
| `title`, `body`        | `string`                                               | Says what arrives here and how; no praise                  |
| `primary`, `secondary` | actions                                                | With their shortcut hint on desktop ("Add application ⌘N") |

Buttons stack when a label is longer than 18 characters (DE). Empty sections on Today are hidden rather than showing an empty state.

## Accessibility checklist (every component)

- [ ] Every color pair is in "Allowed pairings", and the contrast test passes.
- [ ] Meaning never relies on color alone: there's always a label, icon, pattern or text.
- [ ] Hit targets: 44 pt on iOS, ≥ 24 px (default 32) on desktop, 44 px on the touch website.
- [ ] Keyboard: everything is reachable with Tab and arrow keys, the focus ring is visible, and shortcuts are listed in the menu and sheet.
- [ ] Screen readers: role, name and state are set; live regions announce toasts and moves; charts have a sentence summary.
- [ ] Dynamic Type up to AX5 (iOS) and 200 % zoom (desktop, website) without truncating labels that carry meaning.
- [ ] Reduced motion is respected.
- [ ] Light and dark are both captured in critiques (BRIEF §5.5).

## App icon and wordmark

Sources live in `design/brand/`; `build.py assets` writes every platform file, `build.py wordmark` regenerates the lockup. Never edit the generated files in the apps by hand. Critiques: `docs/design/critiques/brand/`.

- **Mark:** a monoline "B" (outlined, `mark.svg`, 1024 grid) in white on a teal plate, gradient `#2B827B → #1B5954` (`accent.solid` dark → `accent.hover` light). Sizes 16, 24 and 32 px use the pixel-grid masters `mark-16/24/32.svg`; don't scale the 1024 master below 48 px.
- **Shapes:** iOS and macOS 26+ get `AppIcon.icon` (Icon Composer; the system masks it and renders dark, tinted and clear). macOS 13–15 use `icon.icns` on Apple's 824-unit body with shadow. Windows, Linux and the web use the plate with a 3/16 corner radius.
- **Dark appearance:** plate `#1E2229 → #0E1014` (`surface.elevated` / `surface.canvas` dark), B in `#43BEB4` (`accent.text` dark).
- **Wordmark:** plate + "BruteForce" in `fg.primary` + "HR" in `accent.text`, Inter Display SemiBold outlines (OFL 1.1), plate height = 100 units, gap 28, cap height centred on the plate. On the website use `Wordmark.astro` (inline, follows the theme; pass a unique `gradientId`); its accessible name is "BruteForceHR". Minimum size 20 px tall. No tagline inside the lockup, no screen-wide wordmark.

## Versioning and change process

- Tokens change only through a PR that updates `packages/ui-tokens` (including the regenerated Swift package) and this doc together. The contrast test must pass, and the change should name the screens it affects.
- Renaming a token is a breaking change. Grep the consumers (`--bfhr-`, Tailwind utility names, `BFHRColor.*` / `BFHRTone.*` in Swift) and migrate them in the same PR. No aliases are kept.
- New colors start as roles, not hex values in components. A component that needs a color that doesn't exist gets a new role here, with its pairings added to `contrastPairs()` (and `increasedContrastPairs()` if it gets an Increase Contrast value).
- A new application status (core enum change) needs a tone in `color.status` for both schemes, or the test fails; regenerate the Swift package so `BFHRStatus` gains the case.
