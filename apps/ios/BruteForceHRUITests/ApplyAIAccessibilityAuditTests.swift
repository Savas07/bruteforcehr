import XCTest

/// Apply's AI pages in design mode (Debug builds; canned `cvTailor` / `coverLetterDraft` answers
/// from the fixture): Xcode's accessibility audit on "Tailor for this job" (choice, review,
/// preview, AI off, limit), the cover letter editor (starter, AI draft with a field to fill, the
/// limit), the kit with answers, the attachment picker, Settings › Application answers and its
/// editor, and CV Studio's "Tailor for a job…", at the default and the largest accessibility text
/// size, plus Turkish and German on the review, the draft and the kit; and the flows: accept,
/// Accept all, Save as new version; Copy in the kit; adding an answer.
final class ApplyAIAccessibilityAuditTests: XCTestCase {
    private let largestText = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]

    override func setUpWithError() throws {
        continueAfterFailure = true
    }

    private func language(_ code: String) -> [String] {
        let locale = ["en": "en_US", "tr": "tr_TR", "de": "de_DE"][code] ?? "en_US"
        return ["-AppleLanguages", "(\(code))", "-AppleLocale", locale]
    }

    /// Launches design mode on `screen` and waits for `ready` (an accessibility identifier).
    @MainActor
    private func launch(_ screen: String, ax: Bool = false, lang: String = "en", extra: [String] = [], ready: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += language(lang) + ["-BFHRScreen", screen, "-BFHRDesign", "populated"] + extra + (ax ? largestText : [])
        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)[ready].firstMatch.waitForExistence(timeout: 20), "\(screen) shows \(ready)")
        return app
    }

    @MainActor
    private func apply(_ step: String, ax: Bool = false, lang: String = "en", ready: String) -> XCUIApplication {
        launch("apply", ax: ax, lang: lang, extra: ["-BFHRApplyStep", step], ready: ready)
    }

    // MARK: Tailor for this job

    @MainActor
    func testAuditTailorChoice() throws {
        let app = apply("tailor", ready: "apply.tailor.suggest")
        try auditSheet(app, "tailor choice", bar: app.buttons["apply.tailor.suggest"], pages: 1)
    }

    @MainActor
    func testAuditTailorChoiceLargestText() throws {
        let app = apply("tailor", ax: true, ready: "apply.tailor.suggest")
        try auditSheet(app, "tailor choice AX", bar: app.buttons["apply.tailor.suggest"], ax: true, pages: 4)
    }

    @MainActor
    func testAuditTailorReview() throws {
        let app = apply("tailor-review", ready: "apply.tailor.save")
        try auditSheet(app, "tailor review", bar: app.buttons["apply.tailor.keepRest"], pages: 6)
    }

    @MainActor
    func testAuditTailorReviewLargestText() throws {
        let app = apply("tailor-review", ax: true, ready: "apply.tailor.save")
        try auditSheet(app, "tailor review AX", bar: app.buttons["apply.tailor.keepRest"], ax: true, pages: 16)
    }

    @MainActor
    func testAuditTailorReviewTurkishAndGerman() throws {
        for lang in ["tr", "de"] {
            let app = apply("tailor-review", lang: lang, ready: "apply.tailor.save")
            try auditSheet(app, "tailor review \(lang)", bar: app.buttons["apply.tailor.keepRest"], pages: 6)
            app.terminate()
        }
    }

    @MainActor
    func testAuditTailorPreview() throws {
        let app = apply("tailor-preview", ready: "apply.tailor.save")
        XCTAssertTrue(app.descendants(matching: .any)["apply.tailor.previewPage"].firstMatch.waitForExistence(timeout: 10), "preview page")
        try auditSheet(app, "tailor preview", bar: app.buttons["apply.tailor.keepRest"], pages: 0)
    }

    @MainActor
    func testAuditTailorStates() throws {
        for (step, ax) in [("tailor-off", false), ("tailor-off", true), ("tailor-limit", false), ("tailor-limit", true), ("tailor-loading", false)] {
            let app = apply(step, ax: ax, ready: step == "tailor-loading" ? "apply.tailor.loading" : "apply.tailor.error")
            try auditSheet(app, "\(step)\(ax ? " AX" : "")", bar: nil, ax: ax, pages: ax ? 2 : 0)
            app.terminate()
        }
    }

    /// Accept one card, Accept all, Save as new version → back on the checklist with the tailored
    /// version selected and the toast.
    @MainActor
    func testTailorAcceptAllAndSave() throws {
        let app = apply("tailor-review", ready: "apply.tailor.save")
        let acceptAll = app.buttons["apply.tailor.acceptAll"]
        XCTAssertTrue(acceptAll.waitForExistence(timeout: 5))
        XCTAssertEqual(acceptAll.label, "Accept all (3)")
        acceptAll.tap()
        XCTAssertTrue(app.staticTexts["apply.tailor.tally"].label.hasPrefix("4 accepted · 1 kept as it was"), app.staticTexts["apply.tailor.tally"].label)
        app.buttons["apply.tailor.save"].tap()
        XCTAssertTrue(app.buttons["apply.continue"].waitForExistence(timeout: 5), "back on the checklist")
        let tailored = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'apply.cv.version:'")).firstMatch
        XCTAssertTrue(tailored.waitForExistence(timeout: 5) && tailored.isSelected, "the tailored version is chosen")
        XCTAssertTrue(contains(app, "Saved as a new version for").waitForExistence(timeout: 5), "toast")
    }

    @MainActor
    func testAuditTailorSavedChecklist() throws {
        let app = apply("tailor-saved", ready: "apply.continue")
        try auditSheet(app, "checklist with a tailored version", bar: app.buttons["apply.continue"], pages: 3)
    }

    // MARK: Cover letter

    @MainActor
    func testAuditLetterEditor() throws {
        let app = apply("letter", ready: "apply.letter.done")
        try auditSheet(app, "letter editor", bar: app.buttons["apply.letter.done"], pages: 3)
    }

    @MainActor
    func testAuditLetterEditorLargestText() throws {
        let app = apply("letter", ax: true, ready: "apply.letter.done")
        try auditSheet(app, "letter editor AX", bar: app.buttons["apply.letter.done"], ax: true, pages: 10)
    }

    @MainActor
    func testAuditLetterDraft() throws {
        for lang in ["en", "tr", "de"] {
            let app = apply("letter-draft", lang: lang, ready: "apply.letter.banner")
            try auditSheet(app, "letter draft \(lang)", bar: app.buttons["apply.letter.done"], pages: 4)
            app.terminate()
        }
    }

    @MainActor
    func testAuditLetterDraftLargestText() throws {
        // At the largest size the draft banner starts below the fold of the lazy List, so wait for
        // the bar's button instead; the page-by-page audit scrolls over the banner.
        let app = apply("letter-draft", ax: true, ready: "apply.letter.done")
        try auditSheet(app, "letter draft AX", bar: app.buttons["apply.letter.done"], ax: true, pages: 12)
    }

    @MainActor
    func testAuditLetterLimit() throws {
        let app = apply("letter-limit", ready: "apply.letter.error")
        try auditSheet(app, "letter limit", bar: app.buttons["apply.letter.done"], pages: 2)
    }

    /// The draft's missing field blocks the letter with its name until it's typed.
    @MainActor
    func testLetterFieldBlocksUntilFilled() throws {
        let app = apply("letter-draft", ready: "apply.letter.banner")
        let blocker = app.staticTexts["apply.letter.blocker"]
        XCTAssertTrue(blocker.waitForExistence(timeout: 5))
        XCTAssertEqual(blocker.label, "Fill in “Hiring manager” in your cover letter before sending.")
        let field = app.textFields["apply.letter.field.hiring_manager"]
        scrollTo(field, in: app)
        field.tap()
        field.typeText("Ms. Weber")
        XCTAssertTrue(blocker.waitForNonExistence(timeout: 5), "unblocked")
    }

    // MARK: Kit, attachments

    @MainActor
    func testAuditKitWithAnswers() throws {
        let app = apply("kit", ready: "apply.openSite")
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'apply.kit.copy.'")).firstMatch.waitForExistence(timeout: 5), "answers")
        try auditSheet(app, "kit", bar: app.buttons["apply.openSite"], pages: 6)
    }

    @MainActor
    func testAuditKitLargestText() throws {
        let app = apply("prompt", ax: true, ready: "apply.kit")
        try auditSheet(app, "kit + prompt AX", bar: app.buttons.matching(identifier: "apply.submitPrompt").firstMatch, ax: true, pages: 16)
    }

    @MainActor
    func testAuditKitTurkishAndGerman() throws {
        for lang in ["tr", "de"] {
            let app = apply("kit", lang: lang, ready: "apply.openSite")
            try auditSheet(app, "kit \(lang)", bar: app.buttons["apply.openSite"], pages: 6)
            app.terminate()
        }
    }

    /// Copy names the item in the toast.
    @MainActor
    func testKitCopyNamesTheItem() throws {
        let app = apply("kit", ready: "apply.openSite")
        let copy = app.buttons["apply.kit.copy.answer-notice"]
        scrollTo(copy, in: app)
        // Clear of the sticky bar: a tap on a row half under it lands on "Open company site".
        let barTop = app.buttons["apply.openSite"].frame.minY
        for _ in 0..<4 where copy.frame.maxY > barTop - 8 { scrollDown(app) }
        XCTAssertEqual(copy.label, "Copy Notice period")
        copy.tap()
        XCTAssertTrue(contains(app, "Notice period copied").waitForExistence(timeout: 5), "toast names the item")
    }

    @MainActor
    func testAuditAttachmentPicker() throws {
        let app = apply("attach", ready: "apply.attach.sheet")
        try auditSheet(app, "attachment picker", bar: nil, pages: 2)
        app.terminate()
        // A fresh sheet at its medium detent, the first saved file in view.
        let again = apply("attach", ready: "apply.attach.sheet")
        try selectAndAdd(again)
    }

    @MainActor
    private func selectAndAdd(_ app: XCUIApplication) throws {
        let file = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'apply.attach.file.'")).firstMatch
        XCTAssertTrue(file.waitForExistence(timeout: 5), "a saved file")
        file.tap()
        XCTAssertTrue(app.buttons["apply.attach.addSelected"].waitForExistence(timeout: 5), "tray")
        try auditSheet(app, "attachment picker tray", bar: app.buttons["apply.attach.addSelected"], pages: 0)
        app.buttons["apply.attach.addSelected"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["apply.attach.sheet"].firstMatch.waitForNonExistence(timeout: 5), "picker closed")
        // The attachments section sits low in the email form (a lazy list): scroll to it.
        let added = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'apply.attach.remove.'")).firstMatch
        scrollTo(added, in: app)
        XCTAssertTrue(added.exists, "the saved file is attached")
    }

    @MainActor
    func testAuditAttachmentPickerLargestText() throws {
        let app = apply("attach", ax: true, ready: "apply.attach.sheet")
        try auditSheet(app, "attachment picker AX", bar: nil, ax: true, pages: 8)
    }

    // MARK: Settings › Application answers

    @MainActor
    func testAuditAnswersLibrary() throws {
        for ax in [false, true] {
            let app = launch("settings", ax: ax, extra: ["-BFHRSettingsPage", "answers"], ready: "settings.answers.page")
            try auditSheet(app, "answers\(ax ? " AX" : "")", bar: nil, ax: ax, pages: ax ? 12 : 3)
            app.terminate()
        }
    }

    @MainActor
    func testAuditAnswerEditor() throws {
        for ax in [false, true] {
            let app = launch("settings", ax: ax, extra: ["-BFHRSettingsPage", "answer-editor"], ready: "answers.editor")
            try auditSheet(app, "answer editor\(ax ? " AX" : "")", bar: nil, ax: ax, pages: ax ? 10 : 3)
            app.terminate()
        }
    }

    /// Add → kind, label, a text → Save: the row is in its section.
    @MainActor
    func testAddAnswer() throws {
        let app = launch("settings", extra: ["-BFHRSettingsPage", "answers"], ready: "settings.answers.page")
        app.buttons["answers.add"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["answers.editor"].firstMatch.waitForExistence(timeout: 5))
        let label = app.textFields["answers.editor.label"]
        label.tap()
        label.press(forDuration: 1.2)
        if app.menuItems["Select All"].waitForExistence(timeout: 2) { app.menuItems["Select All"].tap() }
        label.typeText("Right to work in the UK")
        let text = app.textFields["answers.editor.text.en"].exists ? app.textFields["answers.editor.text.en"] : app.textViews["answers.editor.text.en"]
        text.tap()
        text.typeText("Yes, I hold a Skilled Worker visa.")
        app.buttons["answers.editor.save"].tap()
        XCTAssertTrue(contains(app, "Right to work in the UK").waitForExistence(timeout: 5), "new row")
    }

    // MARK: CV Studio

    @MainActor
    func testAuditCVStudioTailorSheet() throws {
        for ax in [false, true] {
            let app = launch("cv-editor", ax: ax, extra: ["-BFHRCVPane", "tailor"], ready: "cv.tailor.sheet")
            try auditSheet(app, "cv studio tailor\(ax ? " AX" : "")", bar: nil, ax: ax, pages: ax ? 8 : 3)
            app.terminate()
        }
    }

    // MARK: Audit

    @MainActor
    private func auditWholeScreen(_ app: XCUIApplication, _ context: String, ax: Bool, pages: Int) throws {
        try audit(app, "\(context) top", ax: ax, bar: nil)
        for page in 0..<pages {
            scrollDown(app)
            try audit(app, "\(context) page \(page + 1)", ax: ax, bar: nil, scrolled: true)
        }
    }

    @MainActor
    private func auditSheet(_ app: XCUIApplication, _ context: String, bar: XCUIElement?, ax: Bool = false, pages: Int) throws {
        try audit(app, "\(context) top", ax: ax, bar: bar, inSheet: true)
        for page in 0..<pages {
            scrollDown(app)
            try audit(app, "\(context) page \(page + 1)", ax: ax, bar: bar, scrolled: true, inSheet: true)
        }
    }

    /// Runs Xcode's audit. Every issue fails the test except these, each logged as an
    /// `IGNORED (…)` activity and an `AUDIT ignored` line (same exemptions as
    /// JobDetailAccessibilityAuditTests, docs/design/critiques/ios/job-detail/accessibility.md):
    /// - system chrome (tab bar, status bar, navigation bar and its glass toolbar buttons);
    /// - elements not fully inside the content area: below the navigation bar, above the tab bar
    ///   or a sheet's sticky bottom bar (capped at AX1 on purpose, Large Content Viewer), minus the
    ///   24 pt scroll-edge fade. The audit reads contrast and clipping from a screenshot, and
    ///   iOS 26 blurs content under the bars;
    /// - disabled controls (WCAG 1.4.3 exempts them);
    /// - issues with no element (the audit can't say what they refer to);
    /// - Dynamic Type / text clipping at the default size: SwiftUI text-style fonts (`Font.bfhr`)
    ///   are reported as fixed yet scale; the AX runs check these against the real layout;
    /// - contrast, Dynamic Type and clipping on scrolled pages: List cells keep stale
    ///   accessibility frames after a scroll, so these screenshot checks measure other pixels.
    @MainActor
    private func audit(_ app: XCUIApplication, _ context: String, ax: Bool, bar: XCUIElement?, scrolled: Bool = false, inSheet: Bool = false) throws {
        Thread.sleep(forTimeInterval: 1.0) // let scrolling settle
        let window = app.windows.firstMatch.frame
        let top = app.navigationBars.allElementsBoundByIndex.map(\.frame.maxY).max() ?? window.minY
        var bottom = window.maxY
        if let bar, bar.exists {
            bottom = bar.frame.minY - 8
        } else if !inSheet, app.tabBars.firstMatch.exists {
            bottom = app.tabBars.firstMatch.frame.minY
        }
        let edge: CGFloat = 24
        let content = CGRect(x: window.minX, y: top + edge, width: window.width, height: max(0, bottom - top - 2 * edge))
        // "Audit failed to complete in time" (-56) happens on long AX pages when the simulator is
        // busy: retry up to twice after letting it settle.
        for attempt in 0..<3 {
            do {
                try runAudit(app, context, content: content, ax: ax, scrolled: scrolled)
                return
            } catch let error as NSError where error.code == -56 && attempt < 2 {
                // A hung audit is usually stuck on one cell mid-layout: settle, and on the second
                // retry move the viewport a little (pages overlap, so nothing is skipped).
                Thread.sleep(forTimeInterval: 2)
                if attempt == 1 {
                    let window = app.windows.firstMatch
                    window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.55))
                        .press(forDuration: 0.05, thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.45)), withVelocity: .slow, thenHoldForDuration: 0.3)
                }
            }
        }
    }

    @MainActor
    private func runAudit(_ app: XCUIApplication, _ context: String, content: CGRect, ax: Bool, scrolled: Bool) throws {
        let visual: [XCUIAccessibilityAuditType] = [.contrast, .dynamicType, .textClipped]
        try app.performAccessibilityAudit { issue in
            func ignore(_ reason: String) -> Bool {
                let label = issue.element.map { "'\($0.label)' \($0.frame)" } ?? "no element"
                print("AUDIT ignored (\(reason)) \(context): \(issue.compactDescription) — \(label)")
                XCTContext.runActivity(named: "IGNORED (\(reason)) \(context): \(issue.compactDescription) — \(label)") { _ in }
                return true
            }
            guard let element = issue.element, element.exists else { return ignore("no element") }
            if [.tabBar, .statusBar, .navigationBar].contains(element.elementType) { return ignore("system chrome") }
            if element.elementType == .button, app.navigationBars.buttons[element.label].exists { return ignore("system chrome") }
            if !element.isEnabled { return ignore("disabled control") }
            if !ax, [.dynamicType, .textClipped].contains(issue.auditType) { return ignore("default-size Dynamic Type, AX run checks it") }
            if scrolled, visual.contains(issue.auditType) { return ignore("visual check after scroll") }
            if !content.contains(element.frame) { return ignore("under bars / off screen") }
            print("AUDIT FAILED \(context): \(issue.auditType.rawValue) \(issue.compactDescription) — \(element.elementType.rawValue) '\(element.label)' \(element.frame)")
            XCTContext.runActivity(named: "ISSUE \(context): \(issue.compactDescription) — \(element.debugDescription.prefix(240))") { _ in }
            return false
        }
    }

    // MARK: Helpers

    @MainActor
    private func contains(_ app: XCUIApplication, _ text: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }

    @MainActor
    private func scrollTo(_ element: XCUIElement, in app: XCUIApplication) {
        var swipes = 0
        while !(element.exists && element.isHittable), swipes < 8 {
            scrollDown(app)
            swipes += 1
        }
    }

    /// Drags the content up by about a third of the screen, above any sticky bottom bar.
    @MainActor
    private func scrollDown(_ app: XCUIApplication) {
        let window = app.windows.firstMatch
        window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6))
            .press(forDuration: 0.05, thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25)), withVelocity: .slow, thenHoldForDuration: 0.1)
    }
}
