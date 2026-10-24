import BFHRCore
import Foundation

/// Onboarding and Settings › Job preferences copy (table "Onboarding"): onboarding-signin.md
/// "Decision — iOS", reworked with skill://ux-copy (TR siz, DE du). Calm, says why we ask, every
/// step optional.
enum OnboardingStrings {
    // Chrome
    static func stepOf(_ step: Int, _ total: Int) -> LocalizedStringResource {
        .bfhr("onboarding.stepOf", default: "Step \(step) of \(total)", table: "Onboarding", comment: "%1$lld = step, %2$lld = number of steps.")
    }
    static let skip = LocalizedStringResource.bfhr("onboarding.skip", default: "Skip for now", table: "Onboarding")
    static let back = LocalizedStringResource.bfhr("onboarding.back", default: "Back", table: "Onboarding")
    static let next = LocalizedStringResource.bfhr("onboarding.continue", default: "Continue", table: "Onboarding")
    static let done = LocalizedStringResource.bfhr("onboarding.done", default: "Done", table: "Onboarding")
    static let saveFailed = LocalizedStringResource.bfhr("onboarding.saveFailed", default: "That didn't save. Check your connection and try again.", table: "Onboarding")

    // Step 1: CV
    static let cvTitle = LocalizedStringResource.bfhr("onboarding.cv.title", default: "Start with your CV", table: "Onboarding")
    static let cvBody = LocalizedStringResource.bfhr("onboarding.cv.body", default: "We'll use it to fill in your profile and preferences. You can change everything later.", table: "Onboarding")
    static let upload = LocalizedStringResource.bfhr("onboarding.cv.upload", default: "Upload a file", table: "Onboarding")
    static let uploadCaption = LocalizedStringResource.bfhr("onboarding.cv.upload.caption", default: "PDF, Word (DOCX) or JSON Resume · up to 20 MB", table: "Onboarding")
    static let linkedIn = LocalizedStringResource.bfhr("onboarding.cv.linkedin", default: "Import LinkedIn export", table: "Onboarding")
    static let linkedInCaption = LocalizedStringResource.bfhr("onboarding.cv.linkedin.caption", default: "The ZIP file LinkedIn emails you", table: "Onboarding")
    static let howToGetIt = LocalizedStringResource.bfhr("onboarding.cv.linkedin.howTo", default: "How to get it", table: "Onboarding")
    static let howToTitle = LocalizedStringResource.bfhr("onboarding.cv.linkedin.howTo.title", default: "Get your LinkedIn data", table: "Onboarding")
    static let howToBody = LocalizedStringResource.bfhr("onboarding.cv.linkedin.howTo.body", default: "In LinkedIn, open Settings › Data privacy › Get a copy of your data, and request the larger archive. LinkedIn emails you a download link, usually within a day. Save the ZIP to Files, then import it here.", table: "Onboarding")
    static let scratch = LocalizedStringResource.bfhr("onboarding.cv.scratch", default: "Start from scratch", table: "Onboarding")
    static let scratchCaption = LocalizedStringResource.bfhr("onboarding.cv.scratch.caption", default: "Build it step by step in CV Studio (about 10 min)", table: "Onboarding")
    static let scratchDone = LocalizedStringResource.bfhr("onboarding.cv.scratch.done", default: "A blank CV is waiting for you in CV Studio.", table: "Onboarding")
    static let reading = LocalizedStringResource.bfhr("onboarding.cv.reading", default: "Reading your CV…", table: "Onboarding")
    static let readingNote = LocalizedStringResource.bfhr("onboarding.cv.reading.note", default: "You can continue. We'll fill in your preferences when it's done.", table: "Onboarding")
    /// "Found 1 role and 4 skills" (the catalogs have no plural variants, so each count is its own
    /// phrase); "Read your CV" when it named neither.
    static func found(roles: Int, skills: Int) -> LocalizedStringResource {
        guard roles + skills > 0 else { return .bfhr("onboarding.cv.read", default: "Read your CV", table: "Onboarding") }
        let roleText = String(localized: roles == 1
            ? .bfhr("onboarding.cv.found.role", default: "1 role", table: "Onboarding")
            : .bfhr("onboarding.cv.found.roles", default: "\(roles) roles", table: "Onboarding", comment: "%lld = roles (2 or more, or 0)."))
        let skillText = String(localized: skills == 1
            ? .bfhr("onboarding.cv.found.skill", default: "1 skill", table: "Onboarding")
            : .bfhr("onboarding.cv.found.skills", default: "\(skills) skills", table: "Onboarding", comment: "%lld = skills (2 or more, or 0)."))
        return .bfhr("onboarding.cv.found", default: "Found \(roleText) and \(skillText)", table: "Onboarding", comment: "%1$@ = \"3 roles\", %2$@ = \"14 skills\".")
    }
    static let savedToStudio = LocalizedStringResource.bfhr("onboarding.cv.saved", default: "Saved to CV Studio. You can check every detail there later.", table: "Onboarding")
    static let cancel = LocalizedStringResource.bfhr("onboarding.cv.cancel", default: "Cancel", table: "Onboarding")
    static let remove = LocalizedStringResource.bfhr("onboarding.cv.remove", default: "Remove", table: "Onboarding")
    static let chooseDifferent = LocalizedStringResource.bfhr("onboarding.cv.chooseDifferent", default: "Choose a different file", table: "Onboarding")
    static let aiDisclosure = LocalizedStringResource.bfhr("onboarding.cv.ai", default: "Your CV is read by AI (Anthropic Claude) to fill in your profile.", table: "Onboarding")

    static func importError(_ error: CVImportError) -> LocalizedStringResource {
        switch error {
        case .unsupported: .bfhr("onboarding.cv.error.unsupported", default: "This file type isn't supported. Use PDF, DOCX, JSON Resume or the LinkedIn ZIP.", table: "Onboarding")
        case .tooLarge: .bfhr("onboarding.cv.error.tooLarge", default: "This file is over 20 MB. Try exporting a smaller PDF.", table: "Onboarding")
        case .unreadable: .bfhr("onboarding.cv.error.unreadable", default: "We couldn't read text in this file. It may be a scan. Try a DOCX, or start from scratch.", table: "Onboarding")
        case .offline: .bfhr("onboarding.cv.error.offline", default: "The upload didn't finish. Check your connection and try again.", table: "Onboarding")
        case .aiDisabled: .bfhr("onboarding.cv.error.aiDisabled", default: "AI is turned off, so we can't read this file. Start from scratch instead, or turn AI on in Settings.", table: "Onboarding")
        case .dailyLimit: .bfhr("onboarding.cv.error.dailyLimit", default: "You've imported several CVs today. Try again tomorrow, or start from scratch.", table: "Onboarding")
        case .other: .bfhr("onboarding.cv.error.other", default: "Something went wrong while reading this file. Try again, or start from scratch.", table: "Onboarding")
        }
    }

    // Step 2: Preferences
    static let prefsTitle = LocalizedStringResource.bfhr("onboarding.prefs.title", default: "What are you looking for?", table: "Onboarding")
    static let prefsBodyCV = LocalizedStringResource.bfhr("onboarding.prefs.body.cv", default: "We filled in what we could from your CV. Adjust anything that's off.", table: "Onboarding")
    static let prefsBody = LocalizedStringResource.bfhr("onboarding.prefs.body", default: "This shapes which jobs we suggest. Everything is optional, and you can change it anytime.", table: "Onboarding")

    static let nameHeader = LocalizedStringResource.bfhr("onboarding.name.header", default: "Your name", table: "Onboarding")
    static let namePlaceholder = LocalizedStringResource.bfhr("onboarding.name.placeholder", default: "First and last name", table: "Onboarding")
    static let nameFooter = LocalizedStringResource.bfhr("onboarding.name.footer", default: "Used on your CVs and in emails you send.", table: "Onboarding")

    static let rolesHeader = LocalizedStringResource.bfhr("onboarding.roles.header", default: "Roles", table: "Onboarding")
    static func roleCount(_ count: Int, _ limit: Int) -> LocalizedStringResource {
        .bfhr("onboarding.roles.count", default: "\(count) of \(limit)", table: "Onboarding", comment: "Roles picked. %1$lld = picked, %2$lld = the limit (5).")
    }
    static let rolePlaceholder = LocalizedStringResource.bfhr("onboarding.roles.placeholder", default: "Add a role, e.g. Product Designer", table: "Onboarding")
    static let addRole = LocalizedStringResource.bfhr("onboarding.roles.add", default: "Add role", table: "Onboarding")
    static func removeItem(_ name: String) -> LocalizedStringResource {
        .bfhr("onboarding.remove", default: "Remove \(name)", table: "Onboarding", comment: "Accessibility label of a token's ✕. %@ = the role, place or language.")
    }
    static func addItem(_ name: String) -> LocalizedStringResource {
        .bfhr("onboarding.add", default: "Add \(name)", table: "Onboarding", comment: "Accessibility label of a suggestion chip. %@ = the role.")
    }
    static let rolesFull = LocalizedStringResource.bfhr("onboarding.roles.full", default: "That's five roles. Remove one to add another.", table: "Onboarding")
    static let rolesFooter = LocalizedStringResource.bfhr("onboarding.roles.footer", default: "We look for these job titles. Your first role names your first saved search.", table: "Onboarding")
    static let suggestions = LocalizedStringResource.bfhr("onboarding.roles.suggestions", default: "From your CV", table: "Onboarding")

    static let seniorityHeader = LocalizedStringResource.bfhr("onboarding.seniority.header", default: "Seniority", table: "Onboarding")
    static let seniorityFooter = LocalizedStringResource.bfhr("onboarding.seniority.footer", default: "The level you're aiming for. Tap it again to clear it.", table: "Onboarding")

    static let whereHeader = LocalizedStringResource.bfhr("onboarding.where.header", default: "Where", table: "Onboarding")
    static let workplace = LocalizedStringResource.bfhr("onboarding.where.workplace", default: "Workplace", table: "Onboarding")
    static let places = LocalizedStringResource.bfhr("onboarding.where.places", default: "Places", table: "Onboarding")
    static let remoteWorldwide = LocalizedStringResource.bfhr("onboarding.where.remoteWorldwide", default: "Remote worldwide", table: "Onboarding")
    static let locationPlaceholder = LocalizedStringResource.bfhr("onboarding.where.placeholder", default: "Add a city or country", table: "Onboarding")
    static let addLocation = LocalizedStringResource.bfhr("onboarding.where.add", default: "Add place", table: "Onboarding")
    static let relocation = LocalizedStringResource.bfhr("onboarding.where.relocation", default: "Open to relocation", table: "Onboarding")
    static let whereFooter = LocalizedStringResource.bfhr("onboarding.where.footer", default: "Pick countries, add cities, or both. Nothing picked means anywhere.", table: "Onboarding")

    static let salaryHeader = LocalizedStringResource.bfhr("onboarding.salary.header", default: "Salary floor (optional)", table: "Onboarding")
    static let salaryRow = LocalizedStringResource.bfhr("onboarding.salary.row", default: "Salary floor", table: "Onboarding")
    static let salaryAmount = LocalizedStringResource.bfhr("onboarding.salary.amount", default: "Lowest salary", table: "Onboarding")
    static let salaryPlaceholder = LocalizedStringResource.bfhr("onboarding.salary.placeholder", default: "Amount", table: "Onboarding")
    static let currency = LocalizedStringResource.bfhr("onboarding.salary.currency", default: "Currency", table: "Onboarding")
    static let period = LocalizedStringResource.bfhr("onboarding.salary.period", default: "Period", table: "Onboarding")
    static let perMonth = LocalizedStringResource.bfhr("onboarding.salary.perMonth", default: "per month", table: "Onboarding")
    static let perYear = LocalizedStringResource.bfhr("onboarding.salary.perYear", default: "per year", table: "Onboarding")
    static let clearSalary = LocalizedStringResource.bfhr("onboarding.salary.clear", default: "Clear salary floor", table: "Onboarding")
    static let salaryFooter = LocalizedStringResource.bfhr("onboarding.salary.footer", default: "Private. We only use it to hide roles that clearly pay less.", table: "Onboarding")

    static let authorizationHeader = LocalizedStringResource.bfhr("onboarding.auth.header", default: "Work authorization", table: "Onboarding")
    static func authorizationQuestion(_ place: String) -> LocalizedStringResource {
        .bfhr("onboarding.auth.question", default: "Can you work in \(place) without sponsorship?", table: "Onboarding", comment: "%@ = a country name.")
    }
    static let authorizationQuestionEU = LocalizedStringResource.bfhr("onboarding.auth.question.eu", default: "Can you work in the EU / EEA without sponsorship?", table: "Onboarding")
    static func answer(_ answer: AuthorizationAnswer) -> LocalizedStringResource {
        switch answer {
        case .yes: .bfhr("onboarding.auth.yes", default: "Yes", table: "Onboarding")
        case .no: .bfhr("onboarding.auth.no", default: "No", table: "Onboarding")
        case .notSure: .bfhr("onboarding.auth.notSure", default: "Not sure", table: "Onboarding")
        }
    }
    static let authorizationFooter = LocalizedStringResource.bfhr("onboarding.auth.footer", default: "This helps us show jobs you can actually take.", table: "Onboarding")
    static let authorizationEmpty = LocalizedStringResource.bfhr("onboarding.auth.empty", default: "Pick a country under Where and we'll ask about it here.", table: "Onboarding")

    static let languagesHeader = LocalizedStringResource.bfhr("onboarding.languages.header", default: "Languages", table: "Onboarding")
    static let addLanguage = LocalizedStringResource.bfhr("onboarding.languages.add", default: "Add language", table: "Onboarding")
    static let otherLanguage = LocalizedStringResource.bfhr("onboarding.languages.other", default: "Other language", table: "Onboarding")
    static let languagesFooter = LocalizedStringResource.bfhr("onboarding.languages.footer", default: "Tap a language to change its level.", table: "Onboarding")
    static let level = LocalizedStringResource.bfhr("onboarding.languages.level", default: "Level", table: "Onboarding")
    static func level(_ level: LanguageLevel) -> LocalizedStringResource {
        switch level {
        case .native: .bfhr("onboarding.level.native", default: "Native", table: "Onboarding")
        case .c2: .bfhr("onboarding.level.c2", default: "C2 · Proficient", table: "Onboarding")
        case .c1: .bfhr("onboarding.level.c1", default: "C1 · Advanced", table: "Onboarding")
        case .b2: .bfhr("onboarding.level.b2", default: "B2 · Upper intermediate", table: "Onboarding")
        case .b1: .bfhr("onboarding.level.b1", default: "B1 · Intermediate", table: "Onboarding")
        case .a2: .bfhr("onboarding.level.a2", default: "A2 · Elementary", table: "Onboarding")
        case .a1: .bfhr("onboarding.level.a1", default: "A1 · Beginner", table: "Onboarding")
        }
    }

    // Step 3: Finish
    static let finishTitle = LocalizedStringResource.bfhr("onboarding.finish.title", default: "Start your first search", table: "Onboarding")
    static let finishBody = LocalizedStringResource.bfhr("onboarding.finish.body", default: "We'll look for new jobs every day and show the best matches on Today. You can change or pause this search in Jobs anytime.", table: "Onboarding")
    static let finishExisting = LocalizedStringResource.bfhr("onboarding.finish.existing", default: "You already have a saved search, so we won't add another. Your preferences are saved.", table: "Onboarding")
    static let lookingFor = LocalizedStringResource.bfhr("onboarding.finish.lookingFor", default: "Looking for", table: "Onboarding")
    static let anyRole = LocalizedStringResource.bfhr("onboarding.finish.anyRole", default: "Jobs that fit your profile", table: "Onboarding")
    static let anywhere = LocalizedStringResource.bfhr("onboarding.finish.anywhere", default: "Anywhere", table: "Onboarding")
    static let howOften = LocalizedStringResource.bfhr("onboarding.finish.howOften", default: "How often", table: "Onboarding")
    static let daily = LocalizedStringResource.bfhr("onboarding.finish.daily", default: "Every day", table: "Onboarding")
    static let alerts = LocalizedStringResource.bfhr("onboarding.finish.alerts", default: "Alerts", table: "Onboarding")
    static let alertsValue = LocalizedStringResource.bfhr("onboarding.finish.alertsValue", default: "Good matches and better", table: "Onboarding")
    static let start = LocalizedStringResource.bfhr("onboarding.finish.start", default: "Start searching", table: "Onboarding")
    static let goToToday = LocalizedStringResource.bfhr("onboarding.finish.today", default: "Go to Today", table: "Onboarding")
    static let starting = LocalizedStringResource.bfhr("onboarding.finish.starting", default: "Setting up your search…", table: "Onboarding")
    static let nothingToSearch = LocalizedStringResource.bfhr("onboarding.finish.nothing", default: "Add a role or a place in your preferences, and we'll search for you every day.", table: "Onboarding")
    static let backToPreferences = LocalizedStringResource.bfhr("onboarding.finish.backToPreferences", default: "Back to preferences", table: "Onboarding")
    static let defaultSearchName = LocalizedStringResource.bfhr("onboarding.finish.defaultName", default: "Jobs for you", table: "Onboarding")

    // Settings › Job preferences
    static let jobPreferences = LocalizedStringResource.bfhr("jobPreferences.title", default: "Job preferences", table: "Onboarding")
    static let jobPreferencesFooter = LocalizedStringResource.bfhr("jobPreferences.footer", default: "These shape your matches and your saved searches. Changes count from the next time your searches run.", table: "Onboarding")
    static let notSet = LocalizedStringResource.bfhr("jobPreferences.notSet", default: "Not set", table: "Onboarding")
    static let loading = LocalizedStringResource.bfhr("jobPreferences.loading", default: "Loading your preferences…", table: "Onboarding")
    static func answered(_ count: Int) -> LocalizedStringResource {
        .bfhr("jobPreferences.answered", default: "\(count) answered", table: "Onboarding", comment: "Work authorization summary. %lld = answered countries.")
    }
}
