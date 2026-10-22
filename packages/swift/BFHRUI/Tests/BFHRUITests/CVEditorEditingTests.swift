import BFHRCore
import BFHRUIFixtures
import Foundation
import Testing
@testable import BFHRUI

@Suite("CVEditor editing, suggestions and preview")
struct CVEditorEditingTests {
    private func model(selecting cvId: String? = "cv-en") throws -> CVEditorModel {
        let document = try FixtureStore.document(.populated)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let model = CVEditorModel(selectedCvId: cvId, now: document.now, calendar: calendar)
        model.load(UserData(document))
        return model
    }

    // MARK: Item drafts

    @Test("An item draft round-trips and saving it changes only the edited fields")
    func itemDraftSave() throws {
        let model = try model()
        var draft = try #require(model.itemDraft(sectionKind: .work, at: 0))
        #expect(draft.title == "Frontend Engineer" && draft.subtitle == "Pazarbox" && draft.isCurrent)
        #expect(draft.bullets.count == 4 && draft.startDate == "2022-03" && draft.endDate == nil)
        #expect(draft.canSave)

        draft.title = "Senior Frontend Engineer"
        draft.bullets.remove(at: 3)
        #expect(model.saveItem(draft, sectionKind: .work, at: 0))
        let work = try #require(model.document?.content.work?.first)
        #expect(work.position == "Senior Frontend Engineer" && work.highlights?.count == 3)
        #expect(work.url == "https://pazarbox.example.com" && work.summary?.hasPrefix("E-commerce") == true)
        #expect(model.document?.hasLocalEdits == true)
    }

    @Test("Ending before the start or leaving a [blank] blocks Save")
    func itemDraftValidation() throws {
        var draft = CVItemDraft()
        #expect(draft.isBlank && !draft.canSave)
        draft.title = "Engineer"
        draft.startDate = "2024-05"
        draft.endDate = "2023-01"
        #expect(draft.endsBeforeStart && !draft.canSave)
        draft.isCurrent = true
        #expect(!draft.endsBeforeStart && draft.canSave)
        draft.bullets = [CVBullet(text: "Cut load time by [X%].")]
        #expect(draft.placeholders == ["[X%]"] && !draft.canSave)

        let model = try model()
        #expect(!model.saveItem(draft, sectionKind: .work, at: nil))
        #expect(model.document?.hasLocalEdits == false)
    }

    @Test("A new item is appended; items reorder; the header and summary save")
    func addMoveHeaderSummary() throws {
        let model = try model()
        var draft = CVItemDraft()
        draft.title = "Spanish"
        draft.detail = "Beginner (A1)"
        #expect(model.saveItem(draft, sectionKind: .languages, at: nil))
        #expect(model.sections.first { $0.kind == .languages }?.summary == .names(["Turkish", "English", "German", "Spanish"]))

        model.moveItems(sectionKind: .work, from: [2], to: 0)
        #expect(model.document?.content.work?.map(\.name) == ["Mavi Yazılım", "Pazarbox", "Kuzey Labs"])

        var header = model.headerDraft
        #expect(header.name == "Deniz Aksoy" && header.city == "Istanbul")
        header.headline = "Senior Frontend Engineer"
        model.saveHeader(header)
        #expect(model.document?.content.basics?.label == "Senior Frontend Engineer")
        #expect(model.document?.content.basics?.location?.countryCode == "TR")

        #expect(!model.saveSummary("Five years, [N] teams."))
        #expect(model.saveSummary("Frontend engineer."))
        #expect(model.summaryText == "Frontend engineer.")
    }

    @Test("Add section shows a hidden section after the others")
    func showSection() throws {
        let model = try model()
        model.showSection(.certificates)
        #expect(model.sections.last?.kind == .certificates)
        #expect(!model.hiddenSections.contains { $0.kind == .certificates })
    }

    @Test("Start from scratch creates and opens a blank CV prefilled from the profile")
    func startFromScratch() throws {
        let document = try FixtureStore.document(.empty)
        let model = CVEditorModel(now: document.now)
        model.load(UserData(document))
        #expect(model.isEmpty)
        let id = model.startFromScratch()
        #expect(!model.isEmpty && model.selectedCvId == id && model.document?.title == "New CV")
        #expect(model.sections.first { $0.kind == .work }?.isEmpty == true)
        #expect(model.document?.isDefault == true)
    }

    // MARK: Versions

    @Test("The version switcher lists the base and its variants from either")
    func selectedGroup() throws {
        let model = try model(selecting: "cv-de")
        let group = try #require(model.selectedGroup)
        #expect(group.base.id == "cv-en" && group.variants.map(\.id) == ["cv-de"])
        model.select(cvId: "cv-en")
        #expect(model.selectedGroup?.variants.map(\.id) == ["cv-de"])
    }

    // MARK: Placeholders and diff

    @Test("Placeholders are found and filled in order")
    func placeholders() {
        let text = "Cut load time by [X%] for [team size] teams."
        #expect(CVPlaceholders.find(in: text) == ["[X%]", "[team size]"])
        #expect(CVPlaceholders.fill(text, with: ["40%", " "]) == "Cut load time by 40% for [team size] teams.")
        #expect(CVPlaceholders.fill(text, with: ["40%", "7"]) == "Cut load time by 40% for 7 teams.")
        #expect(CVPlaceholders.find(in: "React + TypeScript (62 components)").isEmpty)
    }

    @Test("The word diff marks removed and added runs")
    func wordDiff() {
        let segments = CVWordDiff.diff("Led the rebuild of the design system.", "Drove the rebuild of the design system, cutting time by [X%].")
        #expect(segments.first == CVDiffSegment(kind: .removed, text: "Led"))
        #expect(segments[1] == CVDiffSegment(kind: .added, text: "Drove"))
        #expect(segments[2] == CVDiffSegment(kind: .same, text: "the rebuild of the design"))
        #expect(segments.last?.kind == .added)
        let changes = CVWordDiff.changes(segments)
        #expect(changes.first?.removed == "Led" && changes.first?.added == "Drove")
        #expect(CVWordDiff.diff("same text", "same text") == [CVDiffSegment(kind: .same, text: "same text")])
    }

    @Test("A suggestion with blanks can't be used until every blank is filled")
    func assistSession() async throws {
        struct Provider: CVSuggestionProvider {
            func suggestions(for request: CVAssistRequest) async throws -> [CVSuggestion] {
                [CVSuggestion(id: "1", text: "Drove X by [X%].", reasons: [.strongerVerb]),
                 CVSuggestion(id: "2", text: "Owned X.", reasons: [])]
            }
        }
        let session = CVAssistSession(original: "Led X.", language: "en", provider: Provider())
        await session.load()
        #expect(session.suggestions.count == 2 && session.selected?.id == "1")
        #expect(!session.canUse && session.missingPlaceholders == ["[X%]"])
        session.placeholderValues[0] = "30%"
        #expect(session.canUse && session.resolvedText == "Drove X by 30%.")
        session.select(session.suggestions[1])
        #expect(session.canUse && session.resolvedText == "Owned X.")
        #expect(session.translationTargets == ["de", "tr"])
    }

    @Test("No provider: ✦ Improve isn't offered; offline it's disabled")
    func suggestionAvailability() throws {
        let model = try model()
        #expect(!model.offersSuggestions)
        model.suggestionProvider = DesignScenario().cvEditorModel().suggestionProvider
        #expect(model.offersSuggestions && model.canRequestSuggestions)
        model.connection = .offline(lastSyncedAt: nil)
        #expect(!model.canRequestSuggestions)
    }

    // MARK: Preview

    @Test("Page blocks follow the section order in the CV's language")
    func pageBlocks() throws {
        let model = try model()
        let blocks = model.pageBlocks
        guard case .header(let name, let headline, let contact) = blocks.first else {
            Issue.record("No header block")
            return
        }
        #expect(name == "Deniz Aksoy" && headline == "Frontend & Product Engineer")
        #expect(contact.first == "Istanbul, TR" && contact.contains("github.com/deniz-aksoy-example"))
        let headings = blocks.compactMap { if case .heading(let title) = $0 { title } else { nil } }
        #expect(headings == ["Profile", "Experience", "Projects", "Skills", "Education", "Languages", "Talks"])
        #expect(blocks.contains(.entry(title: "Frontend Engineer", subtitle: "Pazarbox", dates: "Mar 2022 – Present", location: "Istanbul, Türkiye",
                                       summary: "E-commerce marketplace with 4M monthly shoppers; member of the checkout and platform squads.",
                                       firstBullet: "Led the rebuild of the design system (62 components, React + TypeScript, Storybook), adopted by 7 product teams.")))

        model.select(cvId: "cv-de")
        let german = model.pageBlocks.compactMap { if case .heading(let title) = $0 { title } else { nil } }
        #expect(german.contains("Berufserfahrung") && german.contains("Kenntnisse"))
        #expect(model.pageBlocks.contains { if case .entry(_, _, let dates?, _, _, _) = $0 { dates.hasSuffix("heute") } else { false } })
        #expect(model.paper == CVPaper(size: .a4, density: .comfortable))
    }

    @Test("Pagination keeps headings with their next block and starts a page when full")
    func pagination() {
        let pages = CVPagination.pages(heights: [100, 20, 300, 20, 300, 100], keepsWithNext: [false, true, false, true, false, false], pageHeight: 500, spacing: 0)
        #expect(pages == [[0, 1, 2], [3, 4, 5]])
        #expect(CVPagination.pages(heights: [], keepsWithNext: [], pageHeight: 500, spacing: 0) == [[]])
        #expect(CVPagination.pages(heights: [900, 10], keepsWithNext: [false, false], pageHeight: 500, spacing: 0) == [[0], [1]])
    }

    @Test("Months parse, compare and count")
    func months() throws {
        let start = try #require(CVMonth(iso: "2022-03"))
        let end = try #require(CVMonth(iso: "2024-05-17"))
        #expect(start < end && start.months(through: end) == 27)
        #expect(CVMonth(iso: "2020")?.month == nil && CVMonth(iso: "2020-13") == nil)
        #expect(end.iso == "2024-05")
    }
}
