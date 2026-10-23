import BFHRCore
import BFHRUIFixtures
import Foundation
import Testing
@testable import BFHRUI

@Suite("CVEditor model")
struct CVEditorModelTests {
    private static var utc: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    private func date(_ iso: String) throws -> Date {
        try #require(ISO8601DateFormatter().date(from: iso))
    }

    private func model(_ dataset: FixtureDataset = .populated, selecting cvId: String? = "cv-en") throws -> CVEditorModel {
        let document = try FixtureStore.document(dataset)
        let model = CVEditorModel(selectedCvId: cvId, now: document.now, calendar: Self.utc)
        model.load(UserData(document))
        return model
    }

    // MARK: List

    @Test("The list groups cv-de under cv-en as a language variant")
    func listGrouping() throws {
        let model = try model()
        #expect(model.phase == .loaded)
        #expect(!model.isEmpty)
        #expect(model.archivedCount == 0)
        let groups = model.groups
        #expect(groups.map(\.base.id) == ["cv-en"])
        let base = try #require(groups.first?.base)
        #expect(base.isDefault && !base.isVariant && base.variantKind == nil)
        #expect(base.language == "en" && base.title == "Base CV — English")
        #expect(base.updatedAt == (try date("2026-10-10T07:30:00Z")))
        let variant = try #require(groups.first?.variants.first)
        #expect(groups.first?.variants.count == 1)
        #expect(variant.id == "cv-de" && variant.language == "de" && variant.parentCvId == "cv-en")
        #expect(variant.variantKind == .language && !variant.isArchived)

        model.filter = .archived
        #expect(model.groups.isEmpty)
    }

    @Test("The empty dataset has no CVs, no selection and no sync status")
    func emptyDataset() throws {
        let model = try model(.empty, selecting: nil)
        #expect(model.phase == .loaded)
        #expect(model.isEmpty)
        #expect(model.groups.isEmpty)
        #expect(model.document == nil && model.sections.isEmpty && model.revisionDays.isEmpty)
        #expect(model.syncStatus == nil)
        #expect(model.archive(cvId: "cv-en") == nil)
    }

    // MARK: Selected CV

    @Test("cv-en shows its template, theme and current revision content")
    func selectedDocument() throws {
        let model = try model()
        let document = try #require(model.document)
        #expect(document.title == "Base CV — English" && document.language == "en")
        #expect(document.variant == nil && document.isDefault && !document.hasLocalEdits)
        #expect(document.templateId == "classic" && document.theme.paperSize == .a4 && document.theme.accentColor == "#2F5D8A")
        #expect(document.currentRevisionId == "rev-en-3")
        #expect(document.content == model.data.revision(id: "rev-en-3")?.content)
        #expect(document.importedFrom?.fileName == "Deniz_Aksoy_CV_2025.pdf")
        #expect(model.syncStatus == .saved(at: try date("2026-10-10T07:30:00Z")))
    }

    @Test("cv-en's sections follow meta.sectionOrder with Header and Summary pinned first")
    func sectionOrder() throws {
        let model = try model()
        #expect(model.sections.map(\.id) == ["header", "summary", "work", "projects", "skills", "education", "languages", "custom:talks"])
        #expect(model.sections.map(\.isPinned) == [true, true, false, false, false, false, false, false])
        #expect(model.sections.last?.kind == .custom(id: "talks", title: "Talks"))
        // Certificates hold content but aren't in sectionOrder, so cv-render hides them.
        let certificates = try #require(model.hiddenSections.first { $0.kind == .certificates })
        #expect(certificates.itemCount == 1)
        #expect(certificates.items.first?.title == "Web Accessibility Specialist (WAS)")
        #expect(certificates.items.first?.subtitle == "IAAP" && certificates.items.first?.date == "2024-11")
        #expect(!model.hiddenSections.contains { $0.kind == .work })
    }

    @Test("cv-en's section summaries and items come from the fixture rows")
    func sectionSummariesAndItems() throws {
        let model = try model()
        func section(_ id: String) throws -> CVSection { try #require(model.sections.first { $0.id == id }) }

        #expect(try section("header").summary == .header(name: "Deniz Aksoy", headline: "Frontend & Product Engineer"))
        guard case .text(let summary) = try section("summary").summary else {
            Issue.record("Summary has no text")
            return
        }
        #expect(summary.hasPrefix("Frontend engineer with five years"))

        let work = try section("work")
        #expect(work.itemCount == 3 && !work.isEmpty)
        #expect(work.summary == .item(title: "Frontend Engineer", subtitle: "Pazarbox", moreCount: 2))
        let pazarbox = try #require(work.items.first)
        #expect(pazarbox.id == "work.0" && pazarbox.startDate == "2022-03" && pazarbox.endDate == nil && pazarbox.isCurrent)
        #expect(pazarbox.firstBullet?.hasPrefix("Led the rebuild of the design system") == true)
        #expect(pazarbox.bulletCount == 4)
        let kuzey = work.items[1]
        #expect(kuzey.title == "Frontend Developer" && kuzey.subtitle == "Kuzey Labs")
        #expect(kuzey.startDate == "2020-02" && kuzey.endDate == "2022-02" && !kuzey.isCurrent)

        let education = try section("education")
        #expect(education.summary == .item(title: "Computer Engineering", subtitle: "Istanbul Technical University", moreCount: 0))
        #expect(education.items.first?.detail == "BSc")

        #expect(try section("languages").summary == .names(["Turkish", "English", "German"]))
        #expect(try section("languages").items.map(\.detail) == ["Native", "Fluent (C1)", "Elementary (A2)"])
        let skills = try section("skills")
        #expect(skills.summary == .names(["Frontend", "Quality", "Product", "Also"]))
        #expect(skills.items.first?.keywords.first == "React")

        let project = try #require(try section("projects").items.first)
        #expect(project.title == "tiny-i18n-lint" && project.isCurrent && project.firstBullet == "1.2k weekly npm downloads")

        let talk = try #require(try section("custom:talks").items.first)
        #expect(talk.title == "Design systems that survive seven teams" && talk.subtitle == "Frontend Istanbul meetup")
        #expect(talk.date == "2025-04" && talk.startDate == nil && !talk.isCurrent)
    }

    @Test("cv-de shows the variant banner data with the base's changes since the translation")
    func variantInfo() throws {
        let model = try model(selecting: "cv-de")
        let variant = try #require(model.document?.variant)
        #expect(variant.kind == .language)
        #expect(variant.parentCvId == "cv-en" && variant.parentTitle == "Base CV — English" && variant.parentLanguage == "en")
        // cv-de was made from rev-en-2; rev-en-3 added Projects, Certificates and Talks.
        #expect(variant.baseChangedSections.contains(.projects))
        #expect(variant.baseChangedSections.contains(.certificates))
        #expect(variant.baseChangedSections.contains(.custom(id: "talks", title: "Talks")))
        #expect(!variant.baseChangedSections.contains(.education))
        #expect(model.sections.map(\.id) == ["header", "summary", "work", "skills", "education", "languages", "custom:vortraege"])
    }

    @Test("Revisions are grouped by day, newest first, with the current one marked")
    func revisionHistory() throws {
        let model = try model()
        #expect(model.revisionDays.map(\.day) == [
            try date("2026-10-10T00:00:00Z"), try date("2026-09-02T00:00:00Z"), try date("2026-08-13T00:00:00Z"),
        ])
        let rows = model.revisionDays.flatMap(\.revisions)
        #expect(rows.map(\.id) == ["rev-en-3", "rev-en-2", "rev-en-1"])
        #expect(rows.map(\.isCurrent) == [true, false, false])
        #expect(rows.map(\.source) == [.manual, .manual, .import])
        #expect(rows.last?.diffSummary == "Imported from Deniz_Aksoy_CV_2025.pdf")

        model.select(cvId: "cv-de")
        let de = model.revisionDays.flatMap(\.revisions)
        #expect(de.map(\.id) == ["rev-de-2", "rev-de-1"])
        #expect(de.first?.source == .aiTailor && de.first?.jobId == "job-tannenbaum-frontend" && de.first?.isCurrent == true)

        model.select(cvId: nil)
        #expect(model.document == nil && model.revisionDays.isEmpty)
    }

    // MARK: Actions

    @Test("Sections reorder below the pinned Header and Summary")
    func moveSection() throws {
        let model = try model()
        model.moveSection(from: 2, to: 4) // Experience below Skills
        #expect(model.sections.map(\.id) == ["header", "summary", "projects", "skills", "work", "education", "languages", "custom:talks"])
        #expect(model.document?.content.meta.sectionOrder == ["basics", "projects", "skills", "work", "education", "languages", "custom:talks"])
        #expect(model.document?.currentRevisionId != "rev-en-3" && model.revisionDays.first?.revisions.first?.diffSummary == "Changed the section order")
        #expect(model.data.revision(id: "rev-en-3")?.content.meta.sectionOrder.first == "basics")

        model.moveSection(from: 0, to: 3) // Header is pinned
        model.moveSection(from: 5, to: 1) // nothing moves above Summary
        model.moveSection(from: 2, to: 99)
        #expect(model.sections.map(\.id) == ["header", "summary", "projects", "skills", "work", "education", "languages", "custom:talks"])

        model.moveSection(from: 4, to: 2) // back: one more revision with the original order
        #expect(model.document?.content == model.data.revision(id: "rev-en-3")?.content)
        #expect(model.syncStatus == .saved(at: model.now))
    }

    @Test("Removing an item shows a toast whose Undo puts it back")
    func removeItemAndUndo() throws {
        let model = try model()
        let original = try #require(model.document?.content)
        let toast = try #require(model.removeItem(sectionKind: .work, at: 0))
        #expect(toast.glyph == ToastGlyph.removed)
        #expect(toast.resolvedMessage == "Removed “Pazarbox — Frontend Engineer”")
        let work = try #require(model.sections.first { $0.kind == .work })
        #expect(work.itemCount == 2 && work.items.first?.subtitle == "Kuzey Labs")
        #expect(work.summary == .item(title: "Frontend Developer", subtitle: "Kuzey Labs", moreCount: 1))
        #expect(model.revisionDays.first?.revisions.first?.diffSummary == "Removed from Experience · Pazarbox")
        #expect(model.syncStatus == .saved(at: model.now))
        #expect(model.pendingSyncIDs.isEmpty) // online

        let undo = try #require(toast.action)
        #expect(undo.role == .undo)
        undo.perform()
        #expect(model.document?.content == original)
        #expect(model.revisionDays.first?.revisions.first?.diffSummary == "Edited Experience · Pazarbox")
        #expect(model.sections.first { $0.kind == .work }?.items.first?.subtitle == "Pazarbox")
    }

    @Test("Removing every item leaves an empty section (ghost row)")
    func emptySection() throws {
        let model = try model()
        for _ in 0..<3 { _ = model.removeItem(sectionKind: .work, at: 0) }
        let work = try #require(model.sections.first { $0.kind == .work })
        #expect(work.isEmpty && work.itemCount == 0 && work.summary == nil)
        #expect(model.removeItem(sectionKind: .work, at: 0) == nil)
        #expect(model.removeItem(sectionKind: .header, at: 0) == nil)
    }

    @Test("Custom-section and single-name items can be removed and restored")
    func removeOtherItems() throws {
        let model = try model()
        let talk = try #require(model.removeItem(sectionKind: .custom(id: "talks", title: "Talks"), at: 0))
        #expect(talk.resolvedMessage == "Removed “Frontend Istanbul meetup — Design systems that survive seven teams”")
        #expect(model.sections.last?.isEmpty == true)
        let language = try #require(model.removeItem(sectionKind: .languages, at: 2))
        #expect(language.resolvedMessage == "Removed “German”")
        #expect(model.sections.first { $0.kind == .languages }?.summary == .names(["Turkish", "English"]))
        talk.action?.perform()
        language.action?.perform()
        #expect(model.document?.content == model.data.revision(id: "rev-en-3")?.content)
        // Hidden sections are editable too.
        #expect(model.removeItem(sectionKind: .certificates, at: 0)?.resolvedMessage == "Removed “IAAP — Web Accessibility Specialist (WAS)”")
    }

    @Test("Every CVEditor string has translated en, tr and de values")
    func stringCatalog() throws {
        // `swift test` copies .xcstrings uncompiled, so check the source catalog itself.
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appending(path: "Sources/BFHRUI/CVEditor/CVEditor.xcstrings")
        struct Catalog: Decodable {
            struct Entry: Decodable {
                struct Localization: Decodable {
                    struct Unit: Decodable { var state: String; var value: String }
                    var stringUnit: Unit
                }
                var extractionState: String?
                var localizations: [String: Localization]
            }
            var strings: [String: Entry]
        }
        let catalog = try JSONDecoder().decode(Catalog.self, from: Data(contentsOf: url))
        #expect(Set(catalog.strings.keys).isSuperset(of: [
            "cvEditor.toast.removedEntry", "cvEditor.toast.removedNamed", "cvEditor.toast.removedUnnamed", "cvEditor.toast.archived",
        ]))
        for (key, entry) in catalog.strings {
            #expect(entry.extractionState == "manual", "\(key)")
            #expect(Set(entry.localizations.keys) == ["en", "tr", "de"], "\(key)")
            #expect(entry.localizations.values.allSatisfy { $0.stringUnit.state == "translated" && !$0.stringUnit.value.contains("!") }, "\(key)")
        }
        #expect(String(localized: CVEditorStrings.removed(title: "Frontend Engineer", subtitle: "Pazarbox"))
            == catalog.strings["cvEditor.toast.removedEntry"]?.localizations["en"]?.stringUnit.value
            .replacingOccurrences(of: "%1$@", with: "Pazarbox").replacingOccurrences(of: "%2$@", with: "Frontend Engineer"))
    }

    @Test("Archiving a variant moves it to the Archived filter; Undo brings it back")
    func archiveAndUndo() throws {
        let model = try model()
        let toast = try #require(model.archive(cvId: "cv-de"))
        #expect(toast.glyph == ToastGlyph.archived)
        #expect(toast.resolvedMessage == "Lebenslauf — Deutsch · archived")
        #expect(model.data.cv(id: "cv-de")?.archivedAt == model.now)
        #expect(model.groups.first?.variants.isEmpty == true)
        #expect(model.archivedCount == 1)
        #expect(model.archive(cvId: "cv-de") == nil)

        model.filter = .archived
        #expect(model.groups.map(\.base.id) == ["cv-de"])
        #expect(model.groups.first?.base.isArchived == true && model.groups.first?.base.variantKind == .language)

        toast.action?.perform()
        #expect(model.data.cv(id: "cv-de")?.archivedAt == nil)
        #expect(model.groups.isEmpty)
        model.filter = .all
        #expect(model.groups.first?.variants.map(\.id) == ["cv-de"])
    }

    @Test("Archiving a base leaves its variant as its own group; archiving all CVs empties the list")
    func archiveBase() throws {
        let model = try model()
        _ = model.archive(cvId: "cv-en")
        #expect(model.groups.map(\.base.id) == ["cv-de"])
        #expect(model.document?.isArchived == true)
        #expect(!model.isEmpty)
        _ = model.archive(cvId: "cv-de")
        #expect(model.isEmpty)
        model.unarchive(cvId: "cv-en")
        #expect(model.groups.map(\.base.id) == ["cv-en"])
        #expect(!model.isEmpty)
    }

    // MARK: Sync

    @Test("Offline edits are saved on this device, then saving, then saved once synced")
    func offlineSyncStatus() throws {
        let model = try model()
        model.connection = .offline(lastSyncedAt: nil)
        _ = model.removeItem(sectionKind: .skills, at: 3)
        #expect(model.pendingSyncIDs == ["cv-en"])
        #expect(model.syncStatus == .savedOnDevice)

        model.moveSection(from: 3, to: 2)
        _ = model.archive(cvId: "cv-de")
        #expect(model.pendingSyncIDs == ["cv-en", "cv-de"])

        model.connection = .backOnline(syncedChanges: 0)
        #expect(model.syncStatus == .saving)
        model.pendingSyncIDs = []
        #expect(model.syncStatus == .saved(at: model.now))
    }

    @Test("A reload shows the CV's current revision from the server")
    func reloadFollowsServer() throws {
        let model = try model()
        _ = model.removeItem(sectionKind: .work, at: 0)
        model.load(model.data)
        #expect(model.sections.first { $0.kind == .work }?.itemCount == 2)

        var moved = model.data
        let index = try #require(moved.cvs.firstIndex { $0.id == "cv-en" })
        moved.cvs[index].currentRevisionId = "rev-en-2"
        model.load(moved)
        #expect(model.document?.hasLocalEdits == false)
        #expect(model.document?.content == moved.revision(id: "rev-en-2")?.content)
    }

    // MARK: Design

    @Test("Design scenarios: populated opens cv-en, empty selects nothing")
    func designScenario() throws {
        let populated = DesignScenario(screen: .cvEditor, dataset: .populated).cvEditorModel()
        #expect(populated.phase == .loaded && populated.selectedCvId == "cv-en" && populated.document?.id == "cv-en")
        let empty = DesignScenario(screen: .cvEditor, dataset: .empty).cvEditorModel()
        #expect(empty.selectedCvId == nil && empty.isEmpty && empty.document == nil)
        let offline = DesignScenario(screen: .cvEditor, dataset: .populated, condition: .offline).cvEditorModel()
        #expect(offline.connection.isOffline && offline.document != nil)
        let loading = DesignScenario(screen: .cvEditor, dataset: .populated, condition: .loading).cvEditorModel()
        #expect(loading.phase == .loading)
    }
}
