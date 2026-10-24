import BFHRCore
import Foundation

/// Settings copy (table "Settings"): settings-account.md "Copy notes", reworked with
/// skill://ux-copy (TR siz, DE du). Plain and reassuring; destructive copy says exactly what
/// happens; safe buttons are worded as the safe choice.
enum SettingsStrings {
    // Root
    static let title = LocalizedStringResource.bfhr("settings.title", default: "Settings", table: "Settings")
    static let done = LocalizedStringResource.bfhr("settings.done", default: "Done", table: "Settings")
    static let signedInAs = LocalizedStringResource.bfhr("settings.signedInAs", default: "Signed in as", table: "Settings")
    static let connections = LocalizedStringResource.bfhr("settings.group.connections", default: "Connections", table: "Settings")
    static let preferences = LocalizedStringResource.bfhr("settings.group.preferences", default: "Preferences", table: "Settings")
    static let mailAccounts = LocalizedStringResource.bfhr("settings.mailAccounts", default: "Mail accounts", table: "Settings")
    static let jobSources = LocalizedStringResource.bfhr("settings.jobSources", default: "Job sources", table: "Settings")
    static let companies = LocalizedStringResource.bfhr("settings.companies", default: "Companies you follow", table: "Settings")
    static let notifications = LocalizedStringResource.bfhr("settings.notifications", default: "Notifications", table: "Settings")
    static let ai = LocalizedStringResource.bfhr("settings.ai", default: "AI", table: "Settings")
    static let language = LocalizedStringResource.bfhr("settings.language", default: "Language", table: "Settings")
    static let appearance = LocalizedStringResource.bfhr("settings.appearance", default: "Appearance", table: "Settings")
    static let appearanceSystem = LocalizedStringResource.bfhr("settings.appearance.system", default: "System", table: "Settings")
    static let appearanceLight = LocalizedStringResource.bfhr("settings.appearance.light", default: "Light", table: "Settings")
    static let appearanceDark = LocalizedStringResource.bfhr("settings.appearance.dark", default: "Dark", table: "Settings")
    static let languageFooter = LocalizedStringResource.bfhr("settings.language.footer", default: "The app follows the language you pick for it in iOS Settings. Notifications use the same language.", table: "Settings")
    static let dataPrivacy = LocalizedStringResource.bfhr("settings.dataPrivacy", default: "Data & privacy", table: "Settings")
    static let about = LocalizedStringResource.bfhr("settings.about", default: "About", table: "Settings")
    static let version = LocalizedStringResource.bfhr("settings.version", default: "Version", table: "Settings")
    static let updatesFooter = LocalizedStringResource.bfhr("settings.about.footer", default: "Updates arrive through TestFlight.", table: "Settings")
    static let signOut = LocalizedStringResource.bfhr("settings.signOut", default: "Sign out", table: "Settings")
    static let on = LocalizedStringResource.bfhr("settings.value.on", default: "On", table: "Settings")
    static let off = LocalizedStringResource.bfhr("settings.value.off", default: "Off", table: "Settings")
    static let needsAttention = LocalizedStringResource.bfhr("settings.value.needsAttention", default: "Needs attention", table: "Settings")
    static let needsAttentionShort = LocalizedStringResource.bfhr("settings.value.needsAttentionShort", default: "Check", table: "Settings", comment: "Short form of Needs attention when the row has no room.")
    static let noneConnected = LocalizedStringResource.bfhr("settings.value.noneConnected", default: "None yet", table: "Settings")
    static let loadFailed = LocalizedStringResource.bfhr("settings.loadFailed", default: "We couldn't load your settings. Changes you make still save.", table: "Settings")
    static let saveFailed = LocalizedStringResource.bfhr("settings.saveFailed", default: "That setting didn't save. Try again.", table: "Settings")

    static func connectedCount(_ count: Int) -> LocalizedStringResource {
        .bfhr("settings.value.connected", default: "\(count) connected", table: "Settings", comment: "%lld = number of mail accounts.")
    }
    static func workingCount(_ count: Int) -> LocalizedStringResource {
        .bfhr("settings.value.working", default: "\(count) working", table: "Settings", comment: "%lld = number of job sources that work.")
    }
    static func companyCount(_ count: Int) -> LocalizedStringResource {
        .bfhr("settings.value.companies", default: "\(count) followed", table: "Settings", comment: "%lld = number of companies.")
    }
    static func quietValue(_ start: String, _ end: String) -> LocalizedStringResource {
        .bfhr("settings.value.quiet", default: "Quiet \(start)–\(end)", table: "Settings", comment: "Trailing value of Notifications. %1$@ = start, %2$@ = end time.")
    }
    static let offInSystem = LocalizedStringResource.bfhr("settings.value.offInSystem", default: "Off in iOS Settings", table: "Settings")

    // Mail accounts
    static let accountsHeader = LocalizedStringResource.bfhr("mailAccounts.header", default: "Connected", table: "Settings")
    static let addAccount = LocalizedStringResource.bfhr("mailAccounts.add", default: "Add email account", table: "Settings")
    static let accountsFooter = LocalizedStringResource.bfhr("mailAccounts.footer", default: "We check connected inboxes every few minutes and keep only job-related emails.", table: "Settings")
    static let accountsEmpty = LocalizedStringResource.bfhr("mailAccounts.empty", default: "Connect an inbox and we'll find replies about your applications.", table: "Settings")
    static let statusUpToDate = LocalizedStringResource.bfhr("mailAccounts.status.ok", default: "Up to date", table: "Settings")
    static let statusChecking = LocalizedStringResource.bfhr("mailAccounts.status.checking", default: "Checking…", table: "Settings")
    static let statusNeedsReconnect = LocalizedStringResource.bfhr("mailAccounts.status.needsReconnect", default: "Needs reconnecting", table: "Settings")
    static let statusError = LocalizedStringResource.bfhr("mailAccounts.status.error", default: "Can't connect right now", table: "Settings")
    static let statusNotChecked = LocalizedStringResource.bfhr("mailAccounts.status.notChecked", default: "Not checked yet", table: "Settings")
    static func statusChecked(_ relative: String) -> LocalizedStringResource {
        .bfhr("mailAccounts.status.checked", default: "Checked \(relative)", table: "Settings", comment: "%@ = relative time, e.g. \"4 min. ago\".")
    }
    static func statusScanning(_ count: Int) -> LocalizedStringResource {
        .bfhr("mailAccounts.status.scanning", default: "Checking past emails · \(count) so far", table: "Settings", comment: "%lld = emails checked.")
    }

    // Account detail
    static let reconnect = LocalizedStringResource.bfhr("account.reconnect", default: "Reconnect", table: "Settings")
    static let reconnectBody = LocalizedStringResource.bfhr("account.reconnect.body", default: "We can't check this inbox until you sign in again. Your stored emails are safe.", table: "Settings")
    static let errorBody = LocalizedStringResource.bfhr("account.error.body", default: "The last check didn't work. We'll keep trying; you can also reconnect.", table: "Settings")
    static let status = LocalizedStringResource.bfhr("account.status", default: "Status", table: "Settings")
    static let lastChecked = LocalizedStringResource.bfhr("account.lastChecked", default: "Last checked", table: "Settings")
    static let provider = LocalizedStringResource.bfhr("account.provider", default: "Provider", table: "Settings")
    static let folders = LocalizedStringResource.bfhr("account.folders", default: "Folders checked", table: "Settings")
    static let foldersValue = LocalizedStringResource.bfhr("account.folders.value", default: "Inbox, Spam", table: "Settings")
    static let storedEmails = LocalizedStringResource.bfhr("account.stored", default: "Job emails stored", table: "Settings")
    static let sending = LocalizedStringResource.bfhr("account.sending", default: "Sending", table: "Settings")
    static let sendingOn = LocalizedStringResource.bfhr("account.sending.on", default: "Can send applications", table: "Settings")
    static let sendingOff = LocalizedStringResource.bfhr("account.sending.off", default: "Reading only", table: "Settings")
    static let pastEmails = LocalizedStringResource.bfhr("account.pastEmails", default: "Past emails", table: "Settings")
    static let checkNow = LocalizedStringResource.bfhr("account.checkNow", default: "Check now", table: "Settings")
    static let checkQueued = LocalizedStringResource.bfhr("account.checkQueued", default: "Checking for new emails", table: "Settings")
    static let checkAgain = LocalizedStringResource.bfhr("account.checkAgain", default: "Check past emails again", table: "Settings")
    static let checkAgainFooter = LocalizedStringResource.bfhr("account.checkAgain.footer", default: "Emails we already stored aren't added twice.", table: "Settings")
    static let scanQueued = LocalizedStringResource.bfhr("account.scanQueued", default: "Checking past emails", table: "Settings")
    static let serverDetails = LocalizedStringResource.bfhr("account.server", default: "Server details", table: "Settings")
    static let disconnect = LocalizedStringResource.bfhr("account.disconnect", default: "Disconnect…", table: "Settings")
    static let actionFailed = LocalizedStringResource.bfhr("account.actionFailed", default: "That didn't go through. Check your connection and try again.", table: "Settings")
    static let needsConnection = LocalizedStringResource.bfhr("account.needsConnection", default: "Needs an internet connection", table: "Settings")
    static func lookbackValue(_ days: Int) -> LocalizedStringResource {
        .bfhr("account.lookback", default: "Last \(days) days", table: "Settings", comment: "%lld = days.")
    }
    static func disconnectTitle(_ address: String) -> LocalizedStringResource {
        .bfhr("account.disconnect.title", default: "Disconnect \(address)?", table: "Settings", comment: "%@ = address.")
    }
    static func disconnectBody(_ count: Int) -> LocalizedStringResource {
        .bfhr("account.disconnect.body", default: "We'll stop checking this inbox, remove our access, and delete the job emails we stored from it (\(count)). Your applications and their history stay.", table: "Settings", comment: "%lld = stored emails.")
    }
    static let disconnectConfirm = LocalizedStringResource.bfhr("account.disconnect.confirm", default: "Disconnect and delete email data", table: "Settings")
    static let keepConnected = LocalizedStringResource.bfhr("account.disconnect.keep", default: "Keep connected", table: "Settings")
    static func disconnected(_ address: String) -> LocalizedStringResource {
        .bfhr("account.disconnected", default: "Disconnected \(address)", table: "Settings", comment: "Toast. %@ = address.")
    }

    // Notifications
    static let permissionOff = LocalizedStringResource.bfhr("notifications.permission.off", default: "Notifications are off for BruteForceHR in iOS Settings.", table: "Settings")
    static let permissionQuiet = LocalizedStringResource.bfhr("notifications.permission.quiet", default: "Notifications arrive quietly, without sound or banner.", table: "Settings")
    static let permissionAsk = LocalizedStringResource.bfhr("notifications.permission.ask", default: "Get a note when an employer replies or an interview invite arrives.", table: "Settings")
    static let openSettings = LocalizedStringResource.bfhr("notifications.openSettings", default: "Open iOS Settings", table: "Settings")
    static let permissionKept = LocalizedStringResource.bfhr("notifications.permission.kept", default: "Your choices below are kept and apply once notifications are on. Everything still shows up in the app.", table: "Settings")
    static let allow = LocalizedStringResource.bfhr("notifications.allow", default: "Allow notifications", table: "Settings")
    static let fromMail = LocalizedStringResource.bfhr("notifications.fromMail", default: "From your email", table: "Settings")
    static let interviews = LocalizedStringResource.bfhr("notifications.interviews", default: "Interview invites", table: "Settings")
    static let offers = LocalizedStringResource.bfhr("notifications.offers", default: "Offers", table: "Settings")
    static let assessments = LocalizedStringResource.bfhr("notifications.assessments", default: "Assessments and deadlines", table: "Settings")
    static let decisions = LocalizedStringResource.bfhr("notifications.decisions", default: "Decisions", table: "Settings")
    static let autoApplied = LocalizedStringResource.bfhr("notifications.autoApplied", default: "Automatic updates", table: "Settings")
    static let fromMailFooter = LocalizedStringResource.bfhr("notifications.fromMail.footer", default: "Decisions are a short, quiet note when a company decides not to move forward. Automatic updates tell you when we changed an application from an email, with Undo.", table: "Settings")
    static let jobs = LocalizedStringResource.bfhr("notifications.jobs", default: "Jobs", table: "Settings")
    static let jobAlerts = LocalizedStringResource.bfhr("notifications.jobAlerts", default: "New matches", table: "Settings")
    static let jobAlertsFooter = LocalizedStringResource.bfhr("notifications.jobAlerts.footer", default: "From saved searches with alerts on, at most one summary at a time.", table: "Settings")
    static let quietHours = LocalizedStringResource.bfhr("notifications.quiet", default: "Quiet hours", table: "Settings")
    static let quietFrom = LocalizedStringResource.bfhr("notifications.quiet.from", default: "From", table: "Settings")
    static let quietTo = LocalizedStringResource.bfhr("notifications.quiet.to", default: "To", table: "Settings")
    static let quietFooter = LocalizedStringResource.bfhr("notifications.quiet.footer", default: "We hold notifications during quiet hours and send them when they end. Everything still shows up in the app.", table: "Settings")
    static func quietSummary(_ start: String, _ end: String) -> LocalizedStringResource {
        .bfhr("notifications.quiet.summary", default: "Quiet every day from \(start) to \(end).", table: "Settings", comment: "%1$@ = start, %2$@ = end time.")
    }
    static func quietZone(_ zone: String) -> LocalizedStringResource {
        .bfhr("notifications.quiet.zone", default: "Times in \(zone), your profile's time zone.", table: "Settings", comment: "%@ = time zone name.")
    }

    // AI
    static let aiEnabled = LocalizedStringResource.bfhr("ai.enabled", default: "Use AI features", table: "Settings")
    static let aiEnabledFooter = LocalizedStringResource.bfhr("ai.enabled.footer", default: "Used to explain matches, help tailor CVs and, if you allow it below, sort job emails. AI never invents CV content.", table: "Settings")
    static let aiMailText = LocalizedStringResource.bfhr("ai.mailText", default: "Allow sending email text to AI", table: "Settings")
    static let aiMailTextFooter = LocalizedStringResource.bfhr("ai.mailText.footer", default: "Only job-related emails, and only the parts needed to sort them, go to Anthropic, which doesn't train on this data. When off, we sort with rules only, so more emails will ask for your review.", table: "Settings")
    static let aiProvider = LocalizedStringResource.bfhr("ai.provider", default: "Provider", table: "Settings")

    // Job sources
    static let sourcesWorking = LocalizedStringResource.bfhr("sources.working", default: "Working", table: "Settings")
    static let sourcesAttention = LocalizedStringResource.bfhr("sources.attention", default: "Having trouble", table: "Settings")
    static let sourcesSkipped = LocalizedStringResource.bfhr("sources.skipped", default: "Not running", table: "Settings")
    static let sourcesFooter = LocalizedStringResource.bfhr("sources.footer", default: "Job sources run on our server for every saved search. A source with trouble skips a run; the others keep working.", table: "Settings")
    static let sourcesEmpty = LocalizedStringResource.bfhr("sources.empty", default: "Source status appears after the first search run.", table: "Settings")
    static let sourcesCompaniesFooter = LocalizedStringResource.bfhr("sources.companies.footer", default: "We also check the job boards of companies you follow.", table: "Settings")
    static let notRunYet = LocalizedStringResource.bfhr("sources.notRunYet", default: "Not run yet", table: "Settings")
    static func lastRun(_ relative: String, jobs: Int) -> LocalizedStringResource {
        .bfhr("sources.lastRun", default: "Ran \(relative) · \(jobs) jobs", table: "Settings", comment: "%1$@ = relative time, %2$lld = jobs found.")
    }
    static func sourceReason(_ reason: JobSourceReason) -> LocalizedStringResource {
        switch reason {
        case .noKey: .bfhr("sources.reason.noKey", default: "Needs a free API key on the server.", table: "Settings")
        case .quotaExhausted: .bfhr("sources.reason.quota", default: "Reached its daily limit. It picks up again tomorrow.", table: "Settings")
        case .rateLimited: .bfhr("sources.reason.rateLimited", default: "The site asked us to slow down. We'll try again on the next run.", table: "Settings")
        case .blocked: .bfhr("sources.reason.blocked", default: "The site isn't letting us in right now. We'll try again later.", table: "Settings")
        case .unavailable: .bfhr("sources.reason.unavailable", default: "The site didn't answer. We'll try again on the next run.", table: "Settings")
        case .invalidResponse: .bfhr("sources.reason.invalid", default: "The site sent something we couldn't read. We'll try again on the next run.", table: "Settings")
        case .disabled: .bfhr("sources.reason.disabled", default: "Turned off for now.", table: "Settings")
        }
    }

    // Companies you follow
    static let companiesFooter = LocalizedStringResource.bfhr("companies.footer", default: "We check these companies' job boards on every saved-search run and add their openings to Jobs.", table: "Settings")
    static let companiesEmpty = LocalizedStringResource.bfhr("companies.empty", default: "Follow a company by its careers page, and its new openings show up in Jobs.", table: "Settings")
    static let addCompany = LocalizedStringResource.bfhr("companies.add", default: "Follow a company", table: "Settings")
    static let companyName = LocalizedStringResource.bfhr("companies.field.name", default: "Company name", table: "Settings")
    static let careersURL = LocalizedStringResource.bfhr("companies.field.url", default: "Careers page", table: "Settings")
    static let careersURLFooter = LocalizedStringResource.bfhr("companies.field.url.footer", default: "Paste the address of the company's jobs page, for example jobs.lever.co/acme. We find its job board for you.", table: "Settings")
    static let invalidURL = LocalizedStringResource.bfhr("companies.field.url.invalid", default: "This doesn't look like a web address. Check it starts with https://.", table: "Settings")
    static let follow = LocalizedStringResource.bfhr("companies.follow", default: "Follow", table: "Settings")
    static let cancel = LocalizedStringResource.bfhr("companies.cancel", default: "Cancel", table: "Settings")
    static let pause = LocalizedStringResource.bfhr("companies.pause", default: "Pause", table: "Settings")
    static let resume = LocalizedStringResource.bfhr("companies.resume", default: "Resume", table: "Settings")
    static let unfollow = LocalizedStringResource.bfhr("companies.unfollow", default: "Unfollow", table: "Settings")
    static let companyChecking = LocalizedStringResource.bfhr("companies.status.pending", default: "Finding the job board…", table: "Settings")
    static let companyNotFound = LocalizedStringResource.bfhr("companies.status.notFound", default: "We couldn't find job postings at this address.", table: "Settings")
    static let companyError = LocalizedStringResource.bfhr("companies.status.error", default: "The job board didn't answer. We'll try again on the next run.", table: "Settings")
    static let companyPaused = LocalizedStringResource.bfhr("companies.status.paused", default: "Paused", table: "Settings")
    static func openJobs(_ count: Int) -> LocalizedStringResource {
        .bfhr("companies.status.openJobs", default: "Open jobs: \(count)", table: "Settings", comment: "%lld = open jobs on the board.")
    }
    static func followed(_ name: String) -> LocalizedStringResource {
        .bfhr("companies.toast.followed", default: "Following \(name)", table: "Settings", comment: "%@ = company.")
    }
    static func unfollowed(_ name: String) -> LocalizedStringResource {
        .bfhr("companies.toast.unfollowed", default: "Stopped following \(name)", table: "Settings", comment: "%@ = company.")
    }
}
