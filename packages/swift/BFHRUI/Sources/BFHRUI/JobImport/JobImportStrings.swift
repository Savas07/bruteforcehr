import BFHRCore
import Foundation

/// Share sheet copy (table `JobImport`): the Share Extension's "Save to BruteForceHR".
enum JobImportStrings {
    static let title = LocalizedStringResource.bfhr("share.title", default: "Save job", table: "JobImport", comment: "Navigation title of the share sheet.")
    static let cancel = LocalizedStringResource.bfhr("share.cancel", default: "Cancel", table: "JobImport")
    static let done = LocalizedStringResource.bfhr("share.done", default: "Done", table: "JobImport")
    static let reading = LocalizedStringResource.bfhr("share.reading", default: "Reading the job posting…", table: "JobImport", comment: "Shown while the server fetches and reads the shared page.")
    static let role = LocalizedStringResource.bfhr("share.role", default: "Role", table: "JobImport", comment: "Job title field.")
    static let company = LocalizedStringResource.bfhr("share.company", default: "Company", table: "JobImport")
    static let location = LocalizedStringResource.bfhr("share.location", default: "Location", table: "JobImport")
    static let locationPrompt = LocalizedStringResource.bfhr("share.locationPrompt", default: "Not stated", table: "JobImport", comment: "Placeholder of the location field when the posting names no place.")
    static let save = LocalizedStringResource.bfhr("share.save", default: "Save", table: "JobImport", comment: "Saves the job to Jobs › Saved and the Tracker's Saved stage.")
    static let saveAndLog = LocalizedStringResource.bfhr("share.saveAndLog", default: "Save and log as applied", table: "JobImport", comment: "Saves the job and adds an application with status Applied, dated today.")
    static let footer = LocalizedStringResource.bfhr("share.footer", default: "Save keeps it in Jobs › Saved. Log as applied also adds it to your Tracker as Applied today. You can change both later.", table: "JobImport", comment: "Footer under the fields explaining the two buttons.")
    static let requiredFooter = LocalizedStringResource.bfhr("share.requiredFooter", default: "Role and company are needed to save it.", table: "JobImport")
    /// %@ = website host, e.g. "linkedin.com".
    static func source(_ host: String) -> LocalizedStringResource {
        .bfhr("share.source", default: "From \(host)", table: "JobImport", comment: "Source line: the website the posting was read from. %@ is the host.")
    }
    static let structured = LocalizedStringResource.bfhr("share.structured", default: "Read from the page's job details", table: "JobImport", comment: "How the fields were found: the site's structured job data or its known layout.")
    static let readByAI = LocalizedStringResource.bfhr("share.readByAI", default: "Read by AI from the page text. Check the details.", table: "JobImport", comment: "How the fields were found: AI fallback, grounded in the page.")
    static let existingTitle = LocalizedStringResource.bfhr("share.existingTitle", default: "Already in your jobs", table: "JobImport")
    static let existingMessage = LocalizedStringResource.bfhr("share.existingMessage", default: "This link is added to the job you saved before. Nothing is duplicated.", table: "JobImport")
    static let saving = LocalizedStringResource.bfhr("share.saving", default: "Saving…", table: "JobImport")
    static let savedTitle = LocalizedStringResource.bfhr("share.savedTitle", default: "Saved to BruteForceHR", table: "JobImport")
    static let savedMessage = LocalizedStringResource.bfhr("share.savedMessage", default: "Find it in Jobs › Saved. Your match appears there in a moment.", table: "JobImport")
    static let loggedTitle = LocalizedStringResource.bfhr("share.loggedTitle", default: "Saved and logged", table: "JobImport")
    static let loggedMessage = LocalizedStringResource.bfhr("share.loggedMessage", default: "It's in your Tracker as Applied today. Good luck.", table: "JobImport")
    static let alreadyTracked = LocalizedStringResource.bfhr("share.alreadyTracked", default: "It was already in your Tracker, so its stage is unchanged.", table: "JobImport")
    static let manualTitle = LocalizedStringResource.bfhr("share.manualTitle", default: "Add it by hand", table: "JobImport")
    static let manualFooter = LocalizedStringResource.bfhr("share.manualFooter", default: "The link is kept in the notes. Save puts it in your Tracker's Saved stage.", table: "JobImport")
    static let addByHand = LocalizedStringResource.bfhr("share.addByHand", default: "Add it by hand", table: "JobImport")
    static let tryAgain = LocalizedStringResource.bfhr("share.tryAgain", default: "Try again", table: "JobImport")
    static let close = LocalizedStringResource.bfhr("share.close", default: "Close", table: "JobImport")
    static let signedOutTitle = LocalizedStringResource.bfhr("share.signedOutTitle", default: "Sign in to BruteForceHR first", table: "JobImport")
    static let signedOutMessage = LocalizedStringResource.bfhr("share.signedOutMessage", default: "Open the BruteForceHR app, sign in, then share the job again.", table: "JobImport")
    static let offlineTitle = LocalizedStringResource.bfhr("share.offlineTitle", default: "You're offline", table: "JobImport")
    static let offlineMessage = LocalizedStringResource.bfhr("share.offlineMessage", default: "Reading a job needs a connection. Try again when you're back online, or add it by hand.", table: "JobImport")
    static let saveFailed = LocalizedStringResource.bfhr("share.saveFailed", default: "Couldn't save. Check your connection and try again.", table: "JobImport")

    static func failure(_ reason: JobImportShareFailure) -> (title: LocalizedStringResource, message: LocalizedStringResource) {
        switch reason {
        case .offline:
            return (offlineTitle, offlineMessage)
        case .reason(let reason):
            switch reason {
            case .blockedBySite:
                return (LocalizedStringResource.bfhr("share.blockedTitle", default: "This site didn't let us read the page", table: "JobImport"), .bfhr("share.blockedMessage", default: "Some job boards show postings only after signing in or a check we don't get past. Add the job by hand instead; the link is kept.", table: "JobImport"))
            case .notFound:
                return (LocalizedStringResource.bfhr("share.notFoundTitle", default: "This posting is no longer online", table: "JobImport"), .bfhr("share.notFoundMessage", default: "The page is gone or moved. If you still want to keep a note of it, add it by hand.", table: "JobImport"))
            case .noJobFound, .notHtml:
                return (LocalizedStringResource.bfhr("share.noJobTitle", default: "No job posting found on this page", table: "JobImport"), .bfhr("share.noJobMessage", default: "Share the page of a single job, or add it by hand.", table: "JobImport"))
            case .aiDisabled:
                return (LocalizedStringResource.bfhr("share.aiOffTitle", default: "This page needs AI to read it", table: "JobImport"), .bfhr("share.aiOffMessage", default: "AI features are turned off in your settings. Add the job by hand, or turn AI on in the app.", table: "JobImport"))
            case .dailyCap:
                return (LocalizedStringResource.bfhr("share.capTitle", default: "Today's AI limit is reached", table: "JobImport"), .bfhr("share.capMessage", default: "It resets at midnight UTC. You can add this job by hand now.", table: "JobImport"))
            case .invalidUrl, .blockedUrl:
                return (LocalizedStringResource.bfhr("share.invalidTitle", default: "This link can't be imported", table: "JobImport"), .bfhr("share.invalidMessage", default: "Only public https web pages can be read. You can add the job by hand.", table: "JobImport"))
            case .rateLimited:
                return (LocalizedStringResource.bfhr("share.busyTitle", default: "We've read enough from this site for now", table: "JobImport"), .bfhr("share.busyMessage", default: "Try again later, or add the job by hand.", table: "JobImport"))
            case .fetchFailed, .tooLarge, .aiUnavailable, .emailUnverified:
                return (LocalizedStringResource.bfhr("share.failedTitle", default: "Couldn't read this page right now", table: "JobImport"), .bfhr("share.failedMessage", default: "Try again in a minute, or add the job by hand.", table: "JobImport"))
            }
        case .unexpected:
            return (LocalizedStringResource.bfhr("share.failedTitle", default: "Couldn't read this page right now", table: "JobImport"), .bfhr("share.failedMessage", default: "Try again in a minute, or add the job by hand.", table: "JobImport"))
        }
    }
}
