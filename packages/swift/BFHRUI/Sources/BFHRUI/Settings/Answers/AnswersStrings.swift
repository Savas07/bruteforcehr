import BFHRCore
import Foundation

/// Copy of Settings › Application answers (table "Answers"). TR uses siz, DE du.
enum AnswersStrings {
    static let title = LocalizedStringResource.bfhr("answers.title", default: "Application answers", table: "Answers")
    static let intro = LocalizedStringResource.bfhr("answers.intro", default: "What application forms ask again and again. The kit picks the ones that fit each job's country, currency and language, ready to copy.", table: "Answers")
    static let emptyTitle = LocalizedStringResource.bfhr("answers.empty.title", default: "No answers yet", table: "Answers")
    static let emptyBody = LocalizedStringResource.bfhr("answers.empty.body", default: "Add your work authorization, notice period, salary expectation and links once. They're there to copy whenever a form asks.", table: "Answers")
    static let add = LocalizedStringResource.bfhr("answers.add", default: "Add answer", table: "Answers")
    static let edit = LocalizedStringResource.bfhr("answers.edit", default: "Edit answer", table: "Answers")
    static let newAnswer = LocalizedStringResource.bfhr("answers.new", default: "New answer", table: "Answers")
    static let save = LocalizedStringResource.bfhr("answers.save", default: "Save", table: "Answers")
    static let cancel = LocalizedStringResource.bfhr("answers.cancel", default: "Cancel", table: "Answers")
    static let delete = LocalizedStringResource.bfhr("answers.delete", default: "Delete answer", table: "Answers")
    static let kind = LocalizedStringResource.bfhr("answers.kind", default: "Kind", table: "Answers")
    static let label = LocalizedStringResource.bfhr("answers.label", default: "Label", table: "Answers")
    static let labelFooter = LocalizedStringResource.bfhr("answers.label.footer", default: "The name you see in the kit, like “Notice period” or “GitHub”.", table: "Answers")
    static let texts = LocalizedStringResource.bfhr("answers.texts", default: "Answer", table: "Answers")
    static let textsFooter = LocalizedStringResource.bfhr("answers.texts.footer", default: "Fill in the languages you apply in. The kit uses the job's language, then yours.", table: "Answers")
    static let whereSection = LocalizedStringResource.bfhr("answers.where", default: "Where it applies", table: "Answers")
    static let countries = LocalizedStringResource.bfhr("answers.countries", default: "Countries", table: "Answers")
    static let countriesPrompt = LocalizedStringResource.bfhr("answers.countries.prompt", default: "Every country", table: "Answers")
    static let countriesFooter = LocalizedStringResource.bfhr("answers.countries.footer", default: "Country codes such as TR, DE or GB, separated by commas. EU covers the EU, the EEA and Switzerland. Leave it empty for every country.", table: "Answers")
    static let currency = LocalizedStringResource.bfhr("answers.currency", default: "Currency", table: "Answers")
    static let anyCurrency = LocalizedStringResource.bfhr("answers.currency.any", default: "Any", table: "Answers")
    static let currencyFooter = LocalizedStringResource.bfhr("answers.currency.footer", default: "A salary answer with a currency shows only for jobs paid in it.", table: "Answers")
    static let everywhere = LocalizedStringResource.bfhr("answers.everywhere", default: "Every country", table: "Answers")
    static let reorder = LocalizedStringResource.bfhr("answers.reorder", default: "Reorder", table: "Answers")
    static let done = LocalizedStringResource.bfhr("answers.done", default: "Done", table: "Answers")

    static func count(_ count: Int) -> LocalizedStringResource {
        count == 1
            ? .bfhr("answers.count.one", default: "1 answer", table: "Answers")
            : .bfhr("answers.count", default: "\(count) answers", table: "Answers", comment: "%lld = number of answers (0, 2 or more).")
    }

    static func deleted(_ label: String) -> LocalizedStringResource {
        .bfhr("answers.deleted", default: "\(label) deleted", table: "Answers", comment: "%@ = the answer's label. Followed by Undo.")
    }

    static func language(_ code: String) -> LocalizedStringResource {
        switch code {
        case "en": .bfhr("answers.language.en", default: "English", table: "Answers")
        case "tr": .bfhr("answers.language.tr", default: "Turkish", table: "Answers")
        case "de": .bfhr("answers.language.de", default: "German", table: "Answers")
        default: .bfhr("answers.language.other", default: "\(code.uppercased())", table: "Answers", comment: "%@ = language code.")
        }
    }

    static func kindName(_ kind: AnswerKind) -> LocalizedStringResource {
        switch kind {
        case .workAuthorization: .bfhr("answers.kind.workAuthorization", default: "Work authorization", table: "Answers")
        case .noticePeriod: .bfhr("answers.kind.noticePeriod", default: "Notice period", table: "Answers")
        case .salaryExpectation: .bfhr("answers.kind.salaryExpectation", default: "Salary expectation", table: "Answers")
        case .link: .bfhr("answers.kind.link", default: "Link", table: "Answers")
        case .qa: .bfhr("answers.kind.qa", default: "Question and answer", table: "Answers")
        }
    }

    /// Section headers of the library.
    static func kindSection(_ kind: AnswerKind) -> LocalizedStringResource {
        switch kind {
        case .workAuthorization: .bfhr("answers.section.workAuthorization", default: "Work authorization", table: "Answers")
        case .noticePeriod: .bfhr("answers.section.noticePeriod", default: "Notice period", table: "Answers")
        case .salaryExpectation: .bfhr("answers.section.salaryExpectation", default: "Salary expectation", table: "Answers")
        case .link: .bfhr("answers.section.link", default: "Links", table: "Answers")
        case .qa: .bfhr("answers.section.qa", default: "Questions and answers", table: "Answers")
        }
    }

    /// The label a new answer of `kind` starts with.
    static func defaultLabel(_ kind: AnswerKind) -> LocalizedStringResource {
        switch kind {
        case .link: .bfhr("answers.defaultLabel.link", default: "LinkedIn", table: "Answers")
        case .qa: .bfhr("answers.defaultLabel.qa", default: "Why do you want to work here?", table: "Answers")
        default: kindName(kind)
        }
    }

    static func problem(_ problem: AnswerDraftProblem) -> LocalizedStringResource {
        switch problem {
        case .label: .bfhr("answers.problem.label", default: "Give the answer a label (up to 200 characters).", table: "Answers")
        case .text: .bfhr("answers.problem.text", default: "Write the answer in at least one language.", table: "Answers")
        case .tooManyTexts: .bfhr("answers.problem.tooManyTexts", default: "An answer can have up to 6 languages.", table: "Answers")
        case .countries: .bfhr("answers.problem.countries", default: "Use two-letter country codes such as DE, or EU, up to 30.", table: "Answers")
        }
    }
}
