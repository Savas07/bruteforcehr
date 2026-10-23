## Accessibility Audit: Insights (iOS)
**Standard:** WCAG 2.1 AA + XCUITest `performAccessibilityAudit` | **Date:** 2026-10-23

Run: `apps/ios/scripts/with-ios-lock.sh xcodebuild test … -only-testing:BruteForceHRUITests/InsightsAccessibilityAuditTests` with `TEST_RUNNER_BFHR_INSIGHTS_SHOTS=artifacts/screens/ios/insights/light` (iPhone 17e, light). 7 tests: populated default (top + 4 pages), populated AX5 (top + 9 pages), empty default / AX5, charts read their numbers, about sheet, drill-down, lower cards.

Ignored (documented false positives, same rules as Tracker/Today audits): system bars, contrast under the nav bar / iOS 26 edge band, disabled controls, Dynamic Type predictions at the default size, issues without an element.

|#|Issue (KEPT in audit.log)|Severity|Resolution|
|---|---|---|---|
|1|About sheet text contrast (3 nodes) over the glass sheet|🟡 Major|**Fixed**: opaque `presentationBackground`.|
|2|Section header "How far do my applications get?" contrast nearly passed|🟢 Minor|**Fixed**: `Fg.secondary`.|
|3|Pipeline "From Insights" chip clear button 17 × 17 pt (`tracker.clearFilter`)|🟡 Major|Owned by TrackerBoard (IosTracker), reported.|
|4|AX5: no clipping or Dynamic Type issues kept on any page|✅|—|
|5|Charts: no colour-only meaning; every bar/stage/row is a button with numbers in its value; card titles are sentences|✅|—|

Re-run after fixes is pending the shared simulator lock (main agent: re-run the command above, expect 1 kept issue — #3 — until IosTracker's fix lands).
