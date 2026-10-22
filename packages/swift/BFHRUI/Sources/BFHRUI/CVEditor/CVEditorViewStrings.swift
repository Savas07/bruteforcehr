import BFHRCore
import Foundation

/// The CV editor's view strings (table "CVEditor"; en, tr with siz, de with du).
enum CVEditorViewStrings {
    private static func r(_ key: StaticString, _ value: String.LocalizationValue, _ comment: StaticString? = nil) -> LocalizedStringResource {
        .bfhr(key, default: value, table: "CVEditor", comment: comment)
    }

    // MARK: Loading, errors, empty

    static let loading = LocalizedStringResource.bfhr("cvEditor.loading", default: "Loading your CVs", table: "CVEditor")
    static let loadingCV = LocalizedStringResource.bfhr("cvEditor.loadingCV", default: "Loading your CV", table: "CVEditor")
    static let errorTitle = LocalizedStringResource.bfhr("cvEditor.error.title", default: "We couldn't load your CVs", table: "CVEditor")
    static let errorTitleCV = LocalizedStringResource.bfhr("cvEditor.error.titleCV", default: "We couldn't load this CV", table: "CVEditor")
    static let emptyTitle = LocalizedStringResource.bfhr("cvEditor.empty.title", default: "No CVs yet", table: "CVEditor")
    static let emptyBody = LocalizedStringResource.bfhr("cvEditor.empty.body", default: "Start from a blank CV with your profile details filled in. Importing a PDF or Word file comes in a later update.", table: "CVEditor")
    static let startFromScratch = LocalizedStringResource.bfhr("cvEditor.empty.scratch", default: "Start from scratch", table: "CVEditor")
    static let newCV = LocalizedStringResource.bfhr("cvEditor.list.new", default: "New CV", table: "CVEditor")

    // MARK: List

    static let filter = LocalizedStringResource.bfhr("cvEditor.list.filter", default: "Filter", table: "CVEditor")
    static let filterAll = LocalizedStringResource.bfhr("cvEditor.list.filterAll", default: "All CVs", table: "CVEditor")
    static func filterArchived(_ count: Int) -> LocalizedStringResource {
        .bfhr("cvEditor.list.filterArchived", default: "Archived (\(count))", table: "CVEditor")
    }
    static let nothingArchived = LocalizedStringResource.bfhr("cvEditor.list.nothingArchived", default: "No archived CVs.", table: "CVEditor")
    static let archive = LocalizedStringResource.bfhr("cvEditor.action.archive", default: "Archive", table: "CVEditor")
    static let restore = LocalizedStringResource.bfhr("cvEditor.action.restore", default: "Restore", table: "CVEditor")
    static let archiveCV = LocalizedStringResource.bfhr("cvEditor.action.archiveCV", default: "Archive CV", table: "CVEditor")
    static let defaultCV = LocalizedStringResource.bfhr("cvEditor.kind.default", default: "Default", table: "CVEditor")
    static let baseCV = LocalizedStringResource.bfhr("cvEditor.kind.base", default: "Base CV", table: "CVEditor")
    static let roleVariant = LocalizedStringResource.bfhr("cvEditor.kind.role", default: "Role variant", table: "CVEditor")
    static func languageVariant(_ language: String) -> LocalizedStringResource {
        .bfhr("cvEditor.kind.language", default: "\(language) variant", table: "CVEditor", comment: "%@ = language name in its own language (Deutsch, Türkçe).")
    }
    static func kindAndEdited(_ kind: LocalizedStringResource, _ date: Date) -> LocalizedStringResource {
        .bfhr("cvEditor.list.kindAndEdited", default: "\(kind) · Edited \(date, format: .dateTime.day().month(.abbreviated))", table: "CVEditor",
              comment: "%1$@ = CV kind (Default, Deutsch variant), %2$@ = date of the last edit.")
    }
    static func edited(_ date: Date) -> LocalizedStringResource {
        .bfhr("cvEditor.list.edited", default: "Edited \(date, format: .dateTime.day().month(.abbreviated))", table: "CVEditor")
    }
    static func archivedOn(_ date: Date) -> LocalizedStringResource {
        .bfhr("cvEditor.list.archivedOn", default: "Archived \(date, format: .dateTime.day().month(.abbreviated))", table: "CVEditor")
    }

    // MARK: CV screen chrome

    static let segmentLabel = LocalizedStringResource.bfhr("cvEditor.segment.label", default: "View", table: "CVEditor")
    static let segmentEdit = LocalizedStringResource.bfhr("cvEditor.segment.edit", default: "Edit", table: "CVEditor")
    static let segmentPreview = LocalizedStringResource.bfhr("cvEditor.segment.preview", default: "Preview", table: "CVEditor")
    static let done = LocalizedStringResource.bfhr("cvEditor.action.done", default: "Done", table: "CVEditor")
    static let reorder = LocalizedStringResource.bfhr("cvEditor.action.reorder", default: "Reorder", table: "CVEditor")
    static let fitToWidth = LocalizedStringResource.bfhr("cvEditor.preview.fit", default: "Fit to width", table: "CVEditor")
    static let actualSize = LocalizedStringResource.bfhr("cvEditor.preview.actualSize", default: "Actual size", table: "CVEditor")
    static let more = LocalizedStringResource.bfhr("cvEditor.action.more", default: "More", table: "CVEditor")
    static let versionsOfThisCV = LocalizedStringResource.bfhr("cvEditor.menu.versions", default: "Versions of this CV", table: "CVEditor")
    static let versionHistory = LocalizedStringResource.bfhr("cvEditor.menu.history", default: "Version history", table: "CVEditor")
    static let reorderSections = LocalizedStringResource.bfhr("cvEditor.menu.reorderSections", default: "Reorder sections", table: "CVEditor")

    static let saving = LocalizedStringResource.bfhr("cvEditor.sync.saving", default: "Saving…", table: "CVEditor")
    static let savedOnDevice = LocalizedStringResource.bfhr("cvEditor.sync.savedOnDevice", default: "Saved on this device", table: "CVEditor")
    static let saveFailed = LocalizedStringResource.bfhr("cvEditor.sync.failed", default: "Couldn't save · Try again", table: "CVEditor")
    static func saved(_ date: Date) -> LocalizedStringResource {
        .bfhr("cvEditor.sync.saved", default: "Saved · \(date, format: .dateTime.day().month(.abbreviated).hour().minute())", table: "CVEditor")
    }

    static func sync(_ status: CVSyncStatus) -> LocalizedStringResource {
        switch status {
        case .saved(let at): saved(at)
        case .saving: saving
        case .savedOnDevice: savedOnDevice
        case .failed: saveFailed
        }
    }

    // MARK: Edit segment

    static let addHeader = LocalizedStringResource.bfhr("cvEditor.ghost.header", default: "Add your name and contact details", table: "CVEditor")
    static let addSummary = LocalizedStringResource.bfhr("cvEditor.ghost.summary", default: "Add a short summary", table: "CVEditor")
    static let editHint = LocalizedStringResource.bfhr("cvEditor.hint.edit", default: "Opens the editor", table: "CVEditor")
    static let add = LocalizedStringResource.bfhr("cvEditor.action.add", default: "Add", table: "CVEditor")
    static func addTo(_ section: LocalizedStringResource) -> LocalizedStringResource {
        .bfhr("cvEditor.action.addTo", default: "Add to \(section)", table: "CVEditor", comment: "%@ = section title (Experience).")
    }
    static let addSection = LocalizedStringResource.bfhr("cvEditor.action.addSection", default: "Add section", table: "CVEditor")
    static func hiddenWithItems(_ count: Int) -> LocalizedStringResource {
        .bfhr("cvEditor.addSection.hiddenItems", default: "Entries saved: \(count)", table: "CVEditor", comment: "Under a hidden section in the Add section menu. %lld = entries it already holds.")
    }
    static let addSectionFooter = LocalizedStringResource.bfhr("cvEditor.addSection.footer", default: "New sections appear on your CV after the others. You can reorder them anytime.", table: "CVEditor")
    static func variantOf(_ parent: String, _ kind: LocalizedStringResource) -> LocalizedStringResource {
        .bfhr("cvEditor.variant.of", default: "Variant of \(parent) · \(kind)", table: "CVEditor", comment: "%1$@ = base CV title, %2$@ = variant kind (Deutsch variant).")
    }
    static let variantInSync = LocalizedStringResource.bfhr("cvEditor.variant.inSync", default: "Edits here stay in this variant. Changes to the base CV don't copy over by themselves.", table: "CVEditor")
    static func baseChanged(_ sections: String) -> LocalizedStringResource {
        .bfhr("cvEditor.variant.baseChanged", default: "The base CV changed since this variant was made: \(sections).", table: "CVEditor", comment: "%@ = list of section titles.")
    }
    static let openBase = LocalizedStringResource.bfhr("cvEditor.variant.openBase", default: "Open base CV", table: "CVEditor")
    static let remove = LocalizedStringResource.bfhr("cvEditor.action.remove", default: "Remove", table: "CVEditor")
    static let moveUp = LocalizedStringResource.bfhr("cvEditor.action.moveUp", default: "Move up", table: "CVEditor")
    static let moveDown = LocalizedStringResource.bfhr("cvEditor.action.moveDown", default: "Move down", table: "CVEditor")
    static let present = LocalizedStringResource.bfhr("cvEditor.date.present", default: "Present", table: "CVEditor")

    static func sectionTitle(_ kind: CVSectionKind) -> LocalizedStringResource {
        switch kind {
        case .header: r("cvEditor.section.header", "Header")
        case .summary: r("cvEditor.section.summary", "Summary")
        case .work: r("cvEditor.section.work", "Experience")
        case .education: r("cvEditor.section.education", "Education")
        case .skills: r("cvEditor.section.skills", "Skills")
        case .languages: r("cvEditor.section.languages", "Languages")
        case .projects: r("cvEditor.section.projects", "Projects")
        case .certificates: r("cvEditor.section.certificates", "Certificates")
        case .volunteer: r("cvEditor.section.volunteer", "Volunteering")
        case .awards: r("cvEditor.section.awards", "Awards")
        case .publications: r("cvEditor.section.publications", "Publications")
        case .interests: r("cvEditor.section.interests", "Interests")
        case .references: r("cvEditor.section.references", "References")
        case .custom(_, let title): .bfhr("cvEditor.section.custom", default: "\(title)", table: "CVEditor")
        }
    }

    static func ghost(_ kind: CVSectionKind) -> LocalizedStringResource {
        switch kind {
        case .header: addHeader
        case .summary: addSummary
        case .work: r("cvEditor.ghost.work", "Add your first role. Start with the most recent.")
        case .education: r("cvEditor.ghost.education", "Add your education")
        case .skills: r("cvEditor.ghost.skills", "Add a group of skills")
        case .languages: r("cvEditor.ghost.languages", "Add a language")
        case .projects: r("cvEditor.ghost.projects", "Add a project")
        case .certificates: r("cvEditor.ghost.certificates", "Add a certificate")
        case .volunteer: r("cvEditor.ghost.volunteer", "Add volunteering")
        case .awards: r("cvEditor.ghost.awards", "Add an award")
        case .publications: r("cvEditor.ghost.publications", "Add a publication")
        case .interests: r("cvEditor.ghost.interests", "Add an interest")
        case .references: r("cvEditor.ghost.references", "Add a reference")
        case .custom: r("cvEditor.ghost.custom", "Add an entry")
        }
    }

    // MARK: Edit sheets

    static func newItemTitle(_ kind: CVSectionKind) -> LocalizedStringResource { addTo(sectionTitle(kind)) }
    static func editItemTitle(_ kind: CVSectionKind) -> LocalizedStringResource { sectionTitle(kind) }
    static let cancel = LocalizedStringResource.bfhr("cvEditor.action.cancel", default: "Cancel", table: "CVEditor")
    static let save = LocalizedStringResource.bfhr("cvEditor.action.save", default: "Save", table: "CVEditor")
    static let discardTitle = LocalizedStringResource.bfhr("cvEditor.discard.title", default: "Discard your changes?", table: "CVEditor")
    static let discard = LocalizedStringResource.bfhr("cvEditor.discard.confirm", default: "Discard changes", table: "CVEditor")
    static let keepEditing = LocalizedStringResource.bfhr("cvEditor.discard.keep", default: "Keep editing", table: "CVEditor")
    static let removeEntry = LocalizedStringResource.bfhr("cvEditor.action.removeEntry", default: "Remove entry", table: "CVEditor")
    static func fillBlanksTitle(_ count: Int) -> LocalizedStringResource {
        .bfhr("cvEditor.blanks.title", default: "Blanks to fill in: \(count)", table: "CVEditor")
    }
    static let fillBlanksBody = LocalizedStringResource.bfhr("cvEditor.blanks.body", default: "Text in [brackets] stands for a detail only you know, like a number. Replace each one with the real value, then save.", table: "CVEditor")
    static func replaceBlank(_ blanks: String) -> LocalizedStringResource {
        .bfhr("cvEditor.blanks.replace", default: "Replace \(blanks) with your real figure.", table: "CVEditor", comment: "%@ = the placeholders, e.g. [X%].")
    }

    static func titleLabel(_ kind: CVSectionKind) -> LocalizedStringResource {
        switch kind {
        case .work, .volunteer: r("cvEditor.field.role", "Role")
        case .education: r("cvEditor.field.area", "Field of study")
        case .skills: r("cvEditor.field.skillGroup", "Skill group")
        case .languages: r("cvEditor.field.language", "Language")
        case .projects: r("cvEditor.field.projectName", "Project name")
        case .certificates: r("cvEditor.field.certificate", "Certificate")
        case .awards: r("cvEditor.field.award", "Award")
        case .interests: r("cvEditor.field.interest", "Interest")
        case .references: r("cvEditor.field.referenceName", "Name")
        case .header, .summary, .publications, .custom: r("cvEditor.field.title", "Title")
        }
    }

    static func detailLabel(_ kind: CVSectionKind) -> LocalizedStringResource {
        switch kind {
        case .education: r("cvEditor.field.degree", "Degree")
        case .skills: r("cvEditor.field.level", "Level")
        case .languages: r("cvEditor.field.fluency", "Fluency")
        default: r("cvEditor.field.detail", "Detail")
        }
    }

    static func subtitleLabel(_ kind: CVSectionKind) -> LocalizedStringResource {
        switch kind {
        case .work: r("cvEditor.field.company", "Company")
        case .education: r("cvEditor.field.institution", "School or university")
        case .certificates: r("cvEditor.field.issuer", "Issued by")
        case .awards: r("cvEditor.field.awarder", "Awarded by")
        case .publications: r("cvEditor.field.publisher", "Publisher")
        case .custom: r("cvEditor.field.place", "Event or place")
        default: r("cvEditor.field.organization", "Organization")
        }
    }

    static func summaryLabel(_ kind: CVSectionKind) -> LocalizedStringResource {
        switch kind {
        case .work: r("cvEditor.field.aboutRole", "About the company or role")
        case .references: r("cvEditor.field.reference", "Reference")
        default: r("cvEditor.field.description", "Description")
        }
    }

    static func currentLabel(_ kind: CVSectionKind) -> LocalizedStringResource {
        switch kind {
        case .work: r("cvEditor.field.currentWork", "I currently work here")
        case .education: r("cvEditor.field.currentStudy", "I'm studying here now")
        default: r("cvEditor.field.ongoing", "Ongoing")
        }
    }

    static func bulletsHeader(_ kind: CVSectionKind) -> LocalizedStringResource {
        kind == .education ? r("cvEditor.field.courses", "Courses") : r("cvEditor.field.highlights", "Highlights")
    }

    static let locationLabel = LocalizedStringResource.bfhr("cvEditor.field.location", default: "Location", table: "CVEditor")
    static let dateLabel = LocalizedStringResource.bfhr("cvEditor.field.date", default: "Date", table: "CVEditor")
    static let startLabel = LocalizedStringResource.bfhr("cvEditor.field.start", default: "Start", table: "CVEditor")
    static let endLabel = LocalizedStringResource.bfhr("cvEditor.field.end", default: "End", table: "CVEditor")
    static let endBeforeStart = LocalizedStringResource.bfhr("cvEditor.field.endBeforeStart", default: "End date is before start date.", table: "CVEditor")
    static let keywordsLabel = LocalizedStringResource.bfhr("cvEditor.field.keywords", default: "Keywords", table: "CVEditor")
    static let keywordsFooter = LocalizedStringResource.bfhr("cvEditor.field.keywordsFooter", default: "Separate keywords with commas.", table: "CVEditor")
    static let urlLabel = LocalizedStringResource.bfhr("cvEditor.field.url", default: "Link", table: "CVEditor")
    static let bulletLabel = LocalizedStringResource.bfhr("cvEditor.field.bullet", default: "Bullet", table: "CVEditor")
    static let addBullet = LocalizedStringResource.bfhr("cvEditor.action.addBullet", default: "Add bullet", table: "CVEditor")
    static let improve = LocalizedStringResource.bfhr("cvEditor.action.improve", default: "Improve with AI", table: "CVEditor")
    static let improveWithAI = improve
    static let suggestionApplied = LocalizedStringResource.bfhr("cvEditor.toast.suggestionApplied", default: "Suggestion applied", table: "CVEditor")

    static let nameLabel = LocalizedStringResource.bfhr("cvEditor.field.name", default: "Full name", table: "CVEditor")
    static let headlineLabel = LocalizedStringResource.bfhr("cvEditor.field.headline", default: "Headline", table: "CVEditor")
    static let headlineFooter = LocalizedStringResource.bfhr("cvEditor.field.headlineFooter", default: "One line under your name, like your role and focus.", table: "CVEditor")
    static let contactHeader = LocalizedStringResource.bfhr("cvEditor.field.contact", default: "Contact", table: "CVEditor")
    static let emailLabel = LocalizedStringResource.bfhr("cvEditor.field.email", default: "Email", table: "CVEditor")
    static let phoneLabel = LocalizedStringResource.bfhr("cvEditor.field.phone", default: "Phone", table: "CVEditor")
    static let websiteLabel = LocalizedStringResource.bfhr("cvEditor.field.website", default: "Website", table: "CVEditor")
    static let cityLabel = LocalizedStringResource.bfhr("cvEditor.field.city", default: "City", table: "CVEditor")
    static let summaryPrompt = LocalizedStringResource.bfhr("cvEditor.summary.prompt", default: "2–3 sentences about what you do and what you're looking for.", table: "CVEditor")
    static let summaryFooter = LocalizedStringResource.bfhr("cvEditor.summary.footer", default: "Recruiters often read this first. Name your focus, your strengths and the role you want.", table: "CVEditor")
    static let noMonth = LocalizedStringResource.bfhr("cvEditor.date.noMonth", default: "No month", table: "CVEditor")
    static let notSet = LocalizedStringResource.bfhr("cvEditor.date.notSet", default: "Not set", table: "CVEditor")
    static let monthLabel = LocalizedStringResource.bfhr("cvEditor.date.month", default: "Month", table: "CVEditor")
    static let yearLabel = LocalizedStringResource.bfhr("cvEditor.date.year", default: "Year", table: "CVEditor")

    // MARK: AI suggestions

    static let improveTitle = improve
    static let yourText = LocalizedStringResource.bfhr("cvEditor.assist.yourText", default: "Your text", table: "CVEditor")
    static let howToImprove = LocalizedStringResource.bfhr("cvEditor.assist.how", default: "What should Claude do?", table: "CVEditor")
    static func mode(_ mode: CVAssistMode) -> LocalizedStringResource {
        switch mode {
        case .rewrite: r("cvEditor.assist.mode.rewrite", "Rewrite")
        case .shorten: r("cvEditor.assist.mode.shorten", "Shorten")
        case .strongerVerb: r("cvEditor.assist.mode.strongerVerb", "Stronger verb")
        case .translate: r("cvEditor.assist.mode.translate", "Translate")
        }
    }
    static let translateTo = LocalizedStringResource.bfhr("cvEditor.assist.translateTo", default: "Translate to", table: "CVEditor")
    static let suggestionsHeader = LocalizedStringResource.bfhr("cvEditor.assist.suggestions", default: "Suggestions", table: "CVEditor")
    static let writingSuggestions = LocalizedStringResource.bfhr("cvEditor.assist.writing", default: "Claude is writing suggestions…", table: "CVEditor")
    static let suggestionsFailed = LocalizedStringResource.bfhr("cvEditor.assist.failed", default: "We couldn't get suggestions. Check your connection, then try again.", table: "CVEditor")
    static let noSuggestions = LocalizedStringResource.bfhr("cvEditor.assist.none", default: "No suggestions for this text. Try another option above.", table: "CVEditor")
    static func suggestionNumber(_ number: Int, _ count: Int) -> LocalizedStringResource {
        .bfhr("cvEditor.assist.number", default: "Suggestion \(number) of \(count)", table: "CVEditor")
    }
    static func reason(_ reason: CVSuggestionReason) -> LocalizedStringResource {
        switch reason {
        case .shorter: r("cvEditor.assist.reason.shorter", "Shorter")
        case .strongerVerb: r("cvEditor.assist.reason.strongerVerb", "Stronger verb")
        case .clearer: r("cvEditor.assist.reason.clearer", "Clearer")
        case .measurableResult: r("cvEditor.assist.reason.result", "Shows a result")
        case .translated: r("cvEditor.assist.reason.translated", "Translated")
        }
    }
    static func changeReplaced(_ removed: String, _ added: String) -> LocalizedStringResource {
        .bfhr("cvEditor.assist.change.replaced", default: "replaced “\(removed)” with “\(added)”", table: "CVEditor", comment: "VoiceOver. %1$@ = removed words, %2$@ = added words.")
    }
    static func changeRemoved(_ removed: String) -> LocalizedStringResource {
        .bfhr("cvEditor.assist.change.removed", default: "removed “\(removed)”", table: "CVEditor", comment: "VoiceOver.")
    }
    static func changeAdded(_ added: String) -> LocalizedStringResource {
        .bfhr("cvEditor.assist.change.added", default: "added “\(added)”", table: "CVEditor", comment: "VoiceOver.")
    }
    static func blankLabel(_ placeholder: String) -> LocalizedStringResource {
        .bfhr("cvEditor.assist.blank", default: "Your value for \(placeholder)", table: "CVEditor", comment: "%@ = the placeholder, e.g. [X%].")
    }
    static let fillInHeader = LocalizedStringResource.bfhr("cvEditor.assist.fillIn", default: "Fill in before you use it", table: "CVEditor")
    static let fillInFooter = LocalizedStringResource.bfhr("cvEditor.assist.fillInFooter", default: "Claude doesn't know your numbers, so it left a blank. Use the real figure, not a guess.", table: "CVEditor")
    static func fillBlanksFirst(_ count: Int) -> LocalizedStringResource {
        .bfhr("cvEditor.assist.blanksLeft", default: "Blanks left to fill in: \(count)", table: "CVEditor")
    }
    static let useSuggestion = LocalizedStringResource.bfhr("cvEditor.assist.use", default: "Use suggestion", table: "CVEditor")
    static let keepMine = LocalizedStringResource.bfhr("cvEditor.assist.keepMine", default: "Keep mine", table: "CVEditor")
    static let editBeforeUsing = LocalizedStringResource.bfhr("cvEditor.assist.edit", default: "Edit before using", table: "CVEditor")

    // MARK: Preview

    static func pageOf(_ number: Int, _ count: Int) -> LocalizedStringResource {
        .bfhr("cvEditor.preview.pageOf", default: "Page \(number) of \(count)", table: "CVEditor")
    }
    static func previewFooter(_ pages: Int, _ paper: String, _ template: String) -> LocalizedStringResource {
        .bfhr("cvEditor.preview.footer", default: "Pages: \(pages) · \(paper) · \(template)", table: "CVEditor",
              comment: "%1$lld = page count, %2$@ = paper size (A4, Letter), %3$@ = template name.")
    }
    static let renderingPreview = LocalizedStringResource.bfhr("cvEditor.preview.rendering", default: "Rendering preview…", table: "CVEditor")
    static let templateClassic = LocalizedStringResource.bfhr("cvEditor.template.classic", default: "Classic, single column", table: "CVEditor")

    // MARK: History and reorder

    static let localEditsNote = LocalizedStringResource.bfhr("cvEditor.history.localEdits", default: "Your latest edits become a new version once they're saved.", table: "CVEditor")
    static func source(_ source: CvRevisionSource) -> LocalizedStringResource {
        switch source {
        case .manual: r("cvEditor.history.manual", "Edited by you")
        case .import: r("cvEditor.history.import", "Imported")
        case .aiTailor: r("cvEditor.history.aiTailor", "Tailored with AI")
        }
    }
    static func sourceAndTime(_ source: LocalizedStringResource, _ date: Date) -> LocalizedStringResource {
        .bfhr("cvEditor.history.sourceAndTime", default: "\(source) · \(date, format: .dateTime.hour().minute())", table: "CVEditor",
              comment: "%1$@ = who made the version, %2$@ = time.")
    }
    static let current = LocalizedStringResource.bfhr("cvEditor.history.current", default: "Current", table: "CVEditor")
    static let pinnedFooter = LocalizedStringResource.bfhr("cvEditor.reorder.pinned", default: "Header and Summary always come first.", table: "CVEditor")
    static let reorderFooter = LocalizedStringResource.bfhr("cvEditor.reorder.footer", default: "Drag to change the order on your CV.", table: "CVEditor")
}
