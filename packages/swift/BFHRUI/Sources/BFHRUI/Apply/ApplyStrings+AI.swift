import BFHRCore
import Foundation

/// Copy of "Tailor for this job", the cover letter editor, the kit's answers and the attachment
/// picker (table "Apply"; research/apply.md "Copy notes"). TR uses siz, DE du.
extension ApplyStrings {
    // MARK: Checklist

    static let tailorRow = LocalizedStringResource.bfhr("apply.tailor.row", default: "Tailor for this job", table: "Apply")
    static let tailorRowBody = LocalizedStringResource.bfhr("apply.tailor.row.body", default: "Suggests edits based on the job description. You review each one.", table: "Apply")

    static func savedVersionDetail(_ kind: ApplyCVOption.SavedVersionKind, language: String) -> LocalizedStringResource {
        switch kind {
        case .tailored: .bfhr("apply.cv.detail.tailored", default: "Tailored for this job · \(language)", table: "Apply", comment: "%@ = language code, e.g. EN.")
        case .pinned: .bfhr("apply.cv.detail.pinned", default: "Version saved for this job · \(language)", table: "Apply", comment: "%@ = language code, e.g. EN.")
        }
    }

    static let letterEdit = LocalizedStringResource.bfhr("apply.letter.edit", default: "Edit cover letter", table: "Apply")
    static let letterWriteFooter = LocalizedStringResource.bfhr("apply.letter.footer.write", default: "Sent as a PDF next to your CV. Write it yourself, start from a template or draft it with AI.", table: "Apply")

    // MARK: Tailor: choose


    static func tailorFrom(_ cvTitle: String, language: String) -> LocalizedStringResource {
        .bfhr("apply.tailor.from", default: "From \(cvTitle) · \(language)", table: "Apply", comment: "%1$@ = CV name, %2$@ = language code.")
    }

    static let tailorIntro = LocalizedStringResource.bfhr("apply.tailor.intro", default: "Claude reads the job description and suggests edits to this CV. It only rewords, reorders or emphasises what your CV already says. Nothing changes until you save.", table: "Apply")
    static let intensityLabel = LocalizedStringResource.bfhr("apply.tailor.intensity", default: "How much to change", table: "Apply")
    static let light = LocalizedStringResource.bfhr("apply.tailor.light", default: "Light", table: "Apply")
    static let thorough = LocalizedStringResource.bfhr("apply.tailor.thorough", default: "Thorough", table: "Apply")
    static let lightBody = LocalizedStringResource.bfhr("apply.tailor.light.body", default: "Wording and order of your bullets and skills.", table: "Apply")
    static let thoroughBody = LocalizedStringResource.bfhr("apply.tailor.thorough.body", default: "Also your headline, summary, and which skills and sections come first.", table: "Apply")
    static let suggestEdits = LocalizedStringResource.bfhr("apply.tailor.suggest", default: "Suggest edits", table: "Apply")
    static let tailorLoading = LocalizedStringResource.bfhr("apply.tailor.loading", default: "Reading the job description…", table: "Apply")
    static let aiDisclosure = LocalizedStringResource.bfhr("apply.tailor.disclosure", default: "AI suggestions. Check every change before saving.", table: "Apply")

    // MARK: Tailor: review

    static func suggestedEdits(_ count: Int) -> LocalizedStringResource {
        count == 1
            ? .bfhr("apply.tailor.heading.one", default: "1 suggested edit", table: "Apply")
            : .bfhr("apply.tailor.heading", default: "\(count) suggested edits", table: "Apply", comment: "%lld = number of edits (2 or more, or 0).")
    }

    static func tally(accepted: Int, kept: Int, pending: Int) -> LocalizedStringResource {
        pending == 0
            ? .bfhr("apply.tailor.tally.done", default: "\(accepted) accepted · \(kept) kept as it was", table: "Apply", comment: "%1$lld accepted, %2$lld kept.")
            : .bfhr("apply.tailor.tally", default: "\(accepted) accepted · \(kept) kept as it was · \(pending) to decide", table: "Apply", comment: "%1$lld accepted, %2$lld kept, %3$lld undecided.")
    }

    static func droppedNote(_ count: Int) -> LocalizedStringResource {
        count == 1
            ? .bfhr("apply.tailor.dropped.one", default: "1 suggestion was left out because it would have added something your CV doesn't say.", table: "Apply")
            : .bfhr("apply.tailor.dropped", default: "\(count) suggestions were left out because they would have added something your CV doesn't say.", table: "Apply", comment: "%lld = 2 or more.")
    }

    static let changes = LocalizedStringResource.bfhr("apply.tailor.changes", default: "Changes", table: "Apply")
    static let preview = LocalizedStringResource.bfhr("apply.tailor.preview", default: "Preview", table: "Apply")
    static let viewLabel = LocalizedStringResource.bfhr("apply.tailor.view", default: "Show", table: "Apply")
    static let allSections = LocalizedStringResource.bfhr("apply.tailor.filter.all", default: "All", table: "Apply")
    static let previewUnavailable = LocalizedStringResource.bfhr("apply.tailor.preview.unavailable", default: "The preview can't be shown in this build. Your edits are still saved as they appear in the list.", table: "Apply")
    static let previewNote = LocalizedStringResource.bfhr("apply.tailor.preview.note", default: "Your CV with the accepted suggestions.", table: "Apply")

    static let accept = LocalizedStringResource.bfhr("apply.tailor.accept", default: "Accept", table: "Apply")
    static let keepOriginal = LocalizedStringResource.bfhr("apply.tailor.keep", default: "Keep original", table: "Apply")
    static let accepted = LocalizedStringResource.bfhr("apply.tailor.accepted", default: "Accepted", table: "Apply")
    static let keptOriginal = LocalizedStringResource.bfhr("apply.tailor.kept", default: "Kept as it was", table: "Apply")
    static let decideAgain = LocalizedStringResource.bfhr("apply.tailor.decideAgain", default: "Decide again", table: "Apply")
    static let original = LocalizedStringResource.bfhr("apply.tailor.original", default: "Original", table: "Apply")
    static let suggestion = LocalizedStringResource.bfhr("apply.tailor.suggestion", default: "Suggestion", table: "Apply")
    static let why = LocalizedStringResource.bfhr("apply.tailor.why", default: "Why", table: "Apply")
    static let basedOn = LocalizedStringResource.bfhr("apply.tailor.basedOn", default: "Based on", table: "Apply")
    static let removedBullet = LocalizedStringResource.bfhr("apply.tailor.removedValue", default: "Removed", table: "Apply")

    static func acceptAll(_ count: Int) -> LocalizedStringResource {
        .bfhr("apply.tailor.acceptAll", default: "Accept all (\(count))", table: "Apply", comment: "%lld = suggestions without a gap still to accept.")
    }

    static func keepRest(_ count: Int) -> LocalizedStringResource {
        .bfhr("apply.tailor.keepRest", default: "Keep original for the rest (\(count))", table: "Apply", comment: "%lld = undecided suggestions.")
    }

    static let saveVersion = LocalizedStringResource.bfhr("apply.tailor.save", default: "Save as new version", table: "Apply")

    static func gapNote(_ gap: String) -> LocalizedStringResource {
        .bfhr("apply.tailor.gap", default: "This leaves \(gap) for a figure only you know, so here you can only keep the original. Add the real number to your CV in CV Studio.", table: "Apply", comment: "%@ = the gap, e.g. [X%].")
    }

    static func operation(_ op: TailorEditOp) -> LocalizedStringResource {
        switch op {
        case .replace: .bfhr("apply.tailor.op.replace", default: "Reworded", table: "Apply")
        case .insert: .bfhr("apply.tailor.op.insert", default: "Added", table: "Apply")
        case .remove: .bfhr("apply.tailor.op.remove", default: "Removed", table: "Apply")
        case .reorder: .bfhr("apply.tailor.op.reorder", default: "New order", table: "Apply")
        }
    }

    static func skipped(_ reason: TailorSkipReason) -> LocalizedStringResource {
        switch reason {
        case .stale: .bfhr("apply.tailor.skipped.stale", default: "Not applied: this part of your CV changed after the suggestion was made.", table: "Apply")
        case .conflict: .bfhr("apply.tailor.skipped.conflict", default: "Not applied: another accepted suggestion already changes this part.", table: "Apply")
        case .invalidPath: .bfhr("apply.tailor.skipped.invalidPath", default: "Not applied: tailoring doesn't change this part of a CV.", table: "Apply")
        }
    }

    static func saveBlocker(_ blocker: TailorSaveBlocker) -> LocalizedStringResource {
        switch blocker {
        case .nothingAccepted: .bfhr("apply.tailor.nothingAccepted", default: "Accept at least one suggestion to save a tailored version.", table: "Apply")
        case .nothingApplied: .bfhr("apply.tailor.nothingApplied", default: "None of the accepted suggestions fit your CV as it is now, so there's nothing to save.", table: "Apply")
        }
    }

    static let noEditsTitle = LocalizedStringResource.bfhr("apply.tailor.none.title", default: "No edits to suggest", table: "Apply")
    static let noEditsBody = LocalizedStringResource.bfhr("apply.tailor.none.body", default: "Your CV already covers what this job asks for, or every idea would have added something your CV doesn't say. You can apply with it as it is.", table: "Apply")

    static func tailorSaved(_ company: String) -> LocalizedStringResource {
        .bfhr("apply.toast.tailorSaved", default: "Saved as a new version for \(company)", table: "Apply", comment: "%@ = company.")
    }

    static func tailorDiffSummary(company: String, role: String, applied: Int, total: Int) -> LocalizedStringResource {
        .bfhr(
            "apply.tailor.diffSummary",
            default: "Tailored for \(company) · \(role): \(applied) of \(total) suggestions",
            table: "Apply",
            comment: "Stored with the tailored version (Version history). %1$@ = company, %2$@ = job title, %3$lld applied, %4$lld proposed."
        )
    }

    // MARK: CV Studio

    static let tailorForJob = LocalizedStringResource.bfhr("apply.tailor.cvMenu", default: "Tailor for a job…", table: "Apply")
    static let pickJobTitle = LocalizedStringResource.bfhr("apply.tailor.pickJob", default: "Tailor for a job", table: "Apply")
    static let noJobsTitle = LocalizedStringResource.bfhr("apply.tailor.noJobs.title", default: "No jobs to tailor for", table: "Apply")
    static let noJobsBody = LocalizedStringResource.bfhr("apply.tailor.noJobs.body", default: "Save a job in Jobs first. Jobs you've already applied to keep the CV they were sent with.", table: "Apply")

    static func pickJobIntro(_ cvTitle: String) -> LocalizedStringResource {
        .bfhr("apply.tailor.pickJob.intro", default: "Pick the job to tailor \(cvTitle) for. The tailored version is saved for that job only; this CV stays as it is.", table: "Apply", comment: "%@ = CV name.")
    }

    // MARK: Location of an edit

    static func section(_ section: TailorLocation.Section) -> LocalizedStringResource {
        switch section {
        case .headline: .bfhr("apply.tailor.section.headline", default: "Headline", table: "Apply")
        case .summary: .bfhr("apply.tailor.section.summary", default: "Summary", table: "Apply")
        case .profile: .bfhr("apply.tailor.section.basics", default: "Profile", table: "Apply")
        case .experience: .bfhr("apply.tailor.section.work", default: "Experience", table: "Apply")
        case .volunteering: .bfhr("apply.tailor.section.volunteer", default: "Volunteering", table: "Apply")
        case .projects: .bfhr("apply.tailor.section.projects", default: "Projects", table: "Apply")
        case .skills: .bfhr("apply.tailor.section.skills", default: "Skills", table: "Apply")
        case .sectionOrder: .bfhr("apply.tailor.section.sectionOrder", default: "Order of sections", table: "Apply")
        case .other(let pointer): .bfhr("apply.tailor.section.other", default: "\(pointer)", table: "Apply", comment: "%@ = a JSON pointer, shown as it is.")
        }
    }

    static func part(_ part: TailorLocation.Part) -> LocalizedStringResource {
        switch part {
        case .bullet(let number): .bfhr("apply.tailor.part.bullet", default: "bullet \(number)", table: "Apply", comment: "%lld = position, from 1.")
        case .bullets: .bfhr("apply.tailor.part.bullets", default: "order of bullets", table: "Apply")
        case .keyword(let number): .bfhr("apply.tailor.part.keyword", default: "keyword \(number)", table: "Apply", comment: "%lld = position, from 1.")
        case .keywords: .bfhr("apply.tailor.part.keywords", default: "order of keywords", table: "Apply")
        case .summary: .bfhr("apply.tailor.part.summary", default: "summary", table: "Apply")
        case .description: .bfhr("apply.tailor.part.description", default: "description", table: "Apply")
        case .groupName: .bfhr("apply.tailor.part.groupName", default: "group name", table: "Apply")
        case .order: .bfhr("apply.tailor.part.order", default: "order", table: "Apply")
        }
    }

    /// "Experience · Paynova · bullet 2".
    static func location(_ location: TailorLocation) -> String {
        var parts = [String(localized: section(location.section))]
        if let item = location.item { parts.append(item) }
        if let piece = location.part { parts.append(String(localized: part(piece))) }
        return parts.joined(separator: " · ")
    }

    // MARK: AI errors

    static func aiErrorTitle(_ error: ApplyAIError) -> LocalizedStringResource {
        switch error {
        case .aiDisabled: .bfhr("apply.ai.off.title", default: "AI is turned off", table: "Apply")
        case .dailyLimit: .bfhr("apply.ai.limit.title", default: "Today's AI limit is reached", table: "Apply")
        case .offline: .bfhr("apply.ai.offline.title", default: "You're offline", table: "Apply")
        case .emailUnverified: .bfhr("apply.ai.unverified.title", default: "Confirm your email to use AI", table: "Apply")
        case .notFound: .bfhr("apply.ai.notFound.title", default: "This CV or job isn't there anymore", table: "Apply")
        case .failed: .bfhr("apply.ai.failed.title", default: "We couldn't get suggestions", table: "Apply")
        }
    }

    static func tailorErrorBody(_ error: ApplyAIError) -> LocalizedStringResource {
        switch error {
        case .aiDisabled: .bfhr("apply.tailor.error.off", default: "Tailoring uses Claude. Turn AI on in Settings, or apply with your CV as it is.", table: "Apply")
        case .dailyLimit: .bfhr("apply.tailor.error.limit", default: "It resets tomorrow. You can still apply with your CV as it is.", table: "Apply")
        case .offline: .bfhr("apply.tailor.error.offline", default: "Tailoring needs a connection. Your CV hasn't changed.", table: "Apply")
        case .emailUnverified: .bfhr("apply.ai.error.unverified", default: "Sign in again with the link we email you, then try again.", table: "Apply")
        case .notFound: .bfhr("apply.ai.error.notFound", default: "It may have been deleted on another device. Go back and pick another one.", table: "Apply")
        case .failed: .bfhr("apply.tailor.error.failed", default: "Something went wrong on our side. Try again in a moment.", table: "Apply")
        }
    }

    static let openAISettings = LocalizedStringResource.bfhr("apply.ai.openSettings", default: "Open AI settings", table: "Apply")

    // MARK: Cover letter editor

    static let template = LocalizedStringResource.bfhr("apply.letter.template", default: "Template", table: "Apply")
    static let noTemplate = LocalizedStringResource.bfhr("apply.letter.template.none", default: "None", table: "Apply")
    static let yourTemplates = LocalizedStringResource.bfhr("apply.letter.template.yours", default: "Your templates", table: "Apply")
    static let starterTemplates = LocalizedStringResource.bfhr("apply.letter.template.starters", default: "Starter templates", table: "Apply")
    static let tone = LocalizedStringResource.bfhr("apply.letter.tone", default: "Tone", table: "Apply")
    static let language = LocalizedStringResource.bfhr("apply.letter.language", default: "Language", table: "Apply")
    static let draftWithAI = LocalizedStringResource.bfhr("apply.letter.draft", default: "Draft with AI", table: "Apply")
    static let draftAgain = LocalizedStringResource.bfhr("apply.letter.draftAgain", default: "Draft again", table: "Apply")
    static let drafting = LocalizedStringResource.bfhr("apply.letter.drafting", default: "Writing from your CV and the job…", table: "Apply")
    static let draftFooter = LocalizedStringResource.bfhr("apply.letter.draft.footer", default: "Claude writes from your CV and the job description only, keeping the template's structure. Figures it can't know stay as [X] for you to fill in.", table: "Apply")
    static let draftBanner = LocalizedStringResource.bfhr("apply.letter.banner", default: "Drafted from your CV and this job. Edit anything.", table: "Apply")

    static func droppedSentences(_ count: Int) -> LocalizedStringResource {
        count == 1
            ? .bfhr("apply.letter.dropped.one", default: "1 sentence was left out because your CV or the job doesn't support it.", table: "Apply")
            : .bfhr("apply.letter.dropped", default: "\(count) sentences were left out because your CV or the job doesn't support them.", table: "Apply", comment: "%lld = 2 or more.")
    }

    static let undo = LocalizedStringResource.bfhr("apply.letter.undo", default: "Undo", table: "Apply")
    static let dismiss = LocalizedStringResource.bfhr("apply.letter.dismiss", default: "Dismiss", table: "Apply")
    static let letterText = LocalizedStringResource.bfhr("apply.letter.text", default: "Letter", table: "Apply")
    static let insertField = LocalizedStringResource.bfhr("apply.letter.insertField", default: "Insert field", table: "Apply")
    static let fieldsToFill = LocalizedStringResource.bfhr("apply.letter.fields", default: "Fields to fill", table: "Apply")
    static let fieldsFooter = LocalizedStringResource.bfhr("apply.letter.fields.footer", default: "Your letter uses these fields, and the job and your profile don't say them. They fill in wherever the field appears.", table: "Apply")
    static let saveAsTemplate = LocalizedStringResource.bfhr("apply.letter.saveTemplate", default: "Save as template", table: "Apply")
    static let templateName = LocalizedStringResource.bfhr("apply.letter.templateName", default: "Template name", table: "Apply")
    static let templateNameBody = LocalizedStringResource.bfhr("apply.letter.templateName.body", default: "Fields like {company} stay as fields, so the template fits any job.", table: "Apply")
    static let save = LocalizedStringResource.bfhr("apply.action.save", default: "Save", table: "Apply")
    static let templateSaved = LocalizedStringResource.bfhr("apply.toast.templateSaved", default: "Saved to your templates", table: "Apply")
    static let useLetter = LocalizedStringResource.bfhr("apply.letter.use", default: "Use this letter", table: "Apply")
    static let longLetter = LocalizedStringResource.bfhr("apply.letter.long", default: "Most cover letters are under 400 words.", table: "Apply")

    static func words(_ count: Int) -> LocalizedStringResource {
        count == 1
            ? .bfhr("apply.letter.words.one", default: "1 word", table: "Apply")
            : .bfhr("apply.letter.words", default: "\(count) words", table: "Apply", comment: "%lld = word count (0, 2 or more).")
    }

    static func toneName(_ tone: CoverLetterTone) -> LocalizedStringResource {
        switch tone {
        case .formal: .bfhr("apply.letter.tone.formal", default: "Formal", table: "Apply")
        case .warm: .bfhr("apply.letter.tone.warm", default: "Warm", table: "Apply")
        case .concise: .bfhr("apply.letter.tone.concise", default: "Concise", table: "Apply")
        }
    }

    static func toneBody(_ tone: CoverLetterTone) -> LocalizedStringResource {
        switch tone {
        case .formal: .bfhr("apply.letter.tone.formal.body", default: "Polite and traditional, for formal employers.", table: "Apply")
        case .warm: .bfhr("apply.letter.tone.warm.body", default: "Friendly and personal, still professional.", table: "Apply")
        case .concise: .bfhr("apply.letter.tone.concise.body", default: "Short and direct: the essentials in a few lines.", table: "Apply")
        }
    }

    static func languageName(_ language: CvAssistLanguage) -> LocalizedStringResource {
        switch language {
        case .en: .bfhr("apply.letter.language.en", default: "English", table: "Apply")
        case .tr: .bfhr("apply.letter.language.tr", default: "Turkish", table: "Apply")
        case .de: .bfhr("apply.letter.language.de", default: "German", table: "Apply")
        }
    }

    static func fieldName(_ field: MergeField) -> LocalizedStringResource {
        switch field {
        case .name: .bfhr("apply.field.name", default: "Your name", table: "Apply")
        case .email: .bfhr("apply.field.email", default: "Your email", table: "Apply")
        case .phone: .bfhr("apply.field.phone", default: "Your phone", table: "Apply")
        case .role: .bfhr("apply.field.role", default: "Job title", table: "Apply")
        case .company: .bfhr("apply.field.company", default: "Company", table: "Apply")
        case .hiringManager: .bfhr("apply.field.hiringManager", default: "Hiring manager", table: "Apply")
        case .jobSource: .bfhr("apply.field.jobSource", default: "Where you found the job", table: "Apply")
        case .date: .bfhr("apply.field.date", default: "Date", table: "Apply")
        }
    }

    static func draftErrorBody(_ error: ApplyAIError) -> LocalizedStringResource {
        switch error {
        case .aiDisabled: .bfhr("apply.letter.error.off", default: "Drafting uses Claude. Turn AI on in Settings, or write the letter yourself.", table: "Apply")
        case .dailyLimit: .bfhr("apply.letter.error.limit", default: "It resets tomorrow. You can write the letter yourself meanwhile.", table: "Apply")
        case .offline: .bfhr("apply.letter.error.offline", default: "Drafting needs a connection. Your letter hasn't changed.", table: "Apply")
        case .emailUnverified: .bfhr("apply.ai.error.unverified", default: "Sign in again with the link we email you, then try again.", table: "Apply")
        case .notFound: .bfhr("apply.letter.error.notFound", default: "The CV, the job or the template isn't there anymore. Pick another one.", table: "Apply")
        case .failed: .bfhr("apply.letter.error.failed", default: "Something went wrong on our side. Try again in a moment.", table: "Apply")
        }
    }

    static func draftErrorTitle(_ error: ApplyAIError) -> LocalizedStringResource {
        if case .failed = error { return .bfhr("apply.letter.error.title", default: "We couldn't draft the letter", table: "Apply") }
        return aiErrorTitle(error)
    }

    static func letterBlocker(_ blocker: LetterBlocker) -> LocalizedStringResource {
        switch blocker {
        case .empty: .bfhr("apply.blocker.emptyLetter", default: "Write the cover letter, or choose None.", table: "Apply")
        case .field(let field): fillField(String(localized: fieldName(field)))
        case .gap(let gap): fillGap(gap)
        }
    }

    static func fillField(_ field: String) -> LocalizedStringResource {
        .bfhr("apply.blocker.field", default: "Fill in “\(field)” in your cover letter before sending.", table: "Apply", comment: "%@ = field name, e.g. Hiring manager.")
    }

    static func fillGap(_ gap: String) -> LocalizedStringResource {
        .bfhr("apply.blocker.gap", default: "Replace \(gap) in your cover letter before sending.", table: "Apply", comment: "%@ = the gap, e.g. [X%].")
    }

    // MARK: Kit

    static let cvSectionKit = LocalizedStringResource.bfhr("apply.kit.cv", default: "CV", table: "Apply")
    static let saveToFiles = LocalizedStringResource.bfhr("apply.kit.saveToFiles", default: "Save to Files", table: "Apply")
    static let share = LocalizedStringResource.bfhr("apply.kit.share", default: "Share", table: "Apply")
    static let copy = LocalizedStringResource.bfhr("apply.kit.copy", default: "Copy", table: "Apply")
    static let kitCVFooter = LocalizedStringResource.bfhr("apply.kit.cv.footer", default: "Save to Files so the form's “Choose file” finds your CV.", table: "Apply")
    static let kitLetterFooter = LocalizedStringResource.bfhr("apply.kit.letter.footer", default: "Copy the text for a form's text box, or share the PDF for an upload.", table: "Apply")
    static let answersSection = LocalizedStringResource.bfhr("apply.kit.answers", default: "Answers", table: "Apply")
    static let answersFooter = LocalizedStringResource.bfhr("apply.kit.answers.footer", default: "From Settings › Application answers, picked for this job's country, currency and language.", table: "Apply")
    static let noAnswers = LocalizedStringResource.bfhr("apply.kit.answers.none", default: "No saved answers fit this job yet. Add your work authorization, notice period and links once, and they're here to copy.", table: "Apply")
    static let addAnswers = LocalizedStringResource.bfhr("apply.kit.answers.add", default: "Add answers", table: "Apply")
    static let savedToFiles = LocalizedStringResource.bfhr("apply.toast.savedToFiles", default: "Saved to Files", table: "Apply")

    static func copied(_ label: String) -> LocalizedStringResource {
        .bfhr("apply.toast.copied", default: "\(label) copied", table: "Apply", comment: "%@ = the answer's label, e.g. Notice period.")
    }

    static func copyItem(_ label: String) -> LocalizedStringResource {
        .bfhr("apply.kit.copyItem", default: "Copy \(label)", table: "Apply", comment: "%@ = the answer's label (VoiceOver).")
    }

    static func answerKind(_ kind: AnswerKind) -> LocalizedStringResource {
        switch kind {
        case .workAuthorization: .bfhr("apply.answers.kind.workAuthorization", default: "Work authorization", table: "Apply")
        case .noticePeriod: .bfhr("apply.answers.kind.noticePeriod", default: "Availability", table: "Apply")
        case .salaryExpectation: .bfhr("apply.answers.kind.salaryExpectation", default: "Compensation", table: "Apply")
        case .link: .bfhr("apply.answers.kind.link", default: "Links", table: "Apply")
        case .qa: .bfhr("apply.answers.kind.qa", default: "Questions and answers", table: "Apply")
        }
    }

    // MARK: Attachments

    static let addAttachment = LocalizedStringResource.bfhr("apply.attach.add", default: "Add attachment", table: "Apply")
    static let attachTitle = LocalizedStringResource.bfhr("apply.attach.title", default: "Add attachments", table: "Apply")
    static let attachYourFiles = LocalizedStringResource.bfhr("apply.attach.yourFiles", default: "Your files", table: "Apply")
    static let attachNoFiles = LocalizedStringResource.bfhr("apply.attach.yourFiles.none", default: "No saved files yet. The PDFs you make for applications show up here.", table: "Apply")
    static let attachOther = LocalizedStringResource.bfhr("apply.attach.other", default: "Other sources", table: "Apply")
    static let attachFromFiles = LocalizedStringResource.bfhr("apply.attach.fromFiles", default: "From Files…", table: "Apply")
    static let attachUnsupported = LocalizedStringResource.bfhr("apply.attach.unsupported", default: "That file type can't be sent. Use a PDF, Word, RTF, text, PNG or JPEG file.", table: "Apply")
    static let attachUnreadable = LocalizedStringResource.bfhr("apply.attach.unreadable", default: "That file couldn't be read.", table: "Apply")
    static let remove = LocalizedStringResource.bfhr("apply.attach.remove", default: "Remove", table: "Apply")

    static func attachLimits(_ size: String) -> LocalizedStringResource {
        .bfhr("apply.attach.limits", default: "Up to 5 files and \(size) in total for this account.", table: "Apply", comment: "%@ = size, e.g. 18 MB.")
    }

    static func attachTotal(count: Int, size: String, limit: String) -> LocalizedStringResource {
        .bfhr("apply.attach.total", default: "\(count) of 5 files · \(size) of \(limit)", table: "Apply", comment: "%1$lld files, %2$@ used, %3$@ allowed.")
    }

    static func attachSelected(_ count: Int) -> LocalizedStringResource {
        .bfhr("apply.attach.selected", default: "Add \(count) selected", table: "Apply", comment: "%lld = selected files.")
    }

    static func attachProblem(_ problem: AttachmentProblem, limit: String) -> LocalizedStringResource {
        switch problem {
        case .tooMany: .bfhr("apply.attach.tooMany", default: "An email can carry up to 5 files.", table: "Apply")
        case .tooLarge: .bfhr("apply.attach.tooLarge", default: "That's more than this account can send (\(limit) in total).", table: "Apply", comment: "%@ = size, e.g. 2.9 MB.")
        }
    }

    static func fileDetail(_ file: RenderedFile) -> String {
        let size = ByteCountFormatter.string(fromByteCount: Int64(file.sizeBytes), countStyle: .file)
        return "\(file.kind.rawValue.uppercased()) · \(size)"
    }
}
