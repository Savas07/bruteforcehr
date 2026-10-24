import BFHRCore
import Foundation

/// Connect email copy (table "MailConnect"): connect-email.md "Copy notes", reworked with
/// skill://ux-copy (TR siz, DE du). Calm, specific, never "all your email".
enum MailConnectStrings {
    // Provider list (Screen A)
    static let title = LocalizedStringResource.bfhr("connect.title", default: "Connect your email", table: "MailConnect")
    static let body = LocalizedStringResource.bfhr("connect.body", default: "We look for application confirmations, interview invites and replies from employers, then suggest updates you confirm.", table: "MailConnect")
    static let signInSection = LocalizedStringResource.bfhr("connect.section.signIn", default: "Sign in with your provider", table: "MailConnect")
    static let appPasswordSection = LocalizedStringResource.bfhr("connect.section.appPassword", default: "Use an app password", table: "MailConnect")
    static let recommended = LocalizedStringResource.bfhr("connect.recommended", default: "Recommended", table: "MailConnect")
    static let notAvailableYet = LocalizedStringResource.bfhr("connect.notAvailableYet", default: "Not set up yet", table: "MailConnect", comment: "Caption on an OAuth provider whose sign-in isn't configured on the server.")
    static let gmailCaption = LocalizedStringResource.bfhr("connect.gmail.caption", default: "Gmail and Google Workspace", table: "MailConnect")
    static let outlookCaption = LocalizedStringResource.bfhr("connect.outlook.caption", default: "Outlook.com, Hotmail, Microsoft 365", table: "MailConnect")
    static let appPasswordCaption = LocalizedStringResource.bfhr("connect.appPassword.caption", default: "Uses an app password", table: "MailConnect")
    static let otherTitle = LocalizedStringResource.bfhr("connect.other.title", default: "Other (IMAP)", table: "MailConnect")
    static let otherCaption = LocalizedStringResource.bfhr("connect.other.caption", default: "Any provider that supports IMAP", table: "MailConnect")
    static let trust = LocalizedStringResource.bfhr("connect.trust", default: "Your mail stays private. We keep only job-related messages, and you can disconnect and delete everything anytime.", table: "MailConnect")
    static let cancel = LocalizedStringResource.bfhr("connect.cancel", default: "Cancel", table: "MailConnect")
    static let done = LocalizedStringResource.bfhr("connect.done", default: "Done", table: "MailConnect")

    // Pre-permission (Screen B)
    static func oauthTitle(_ provider: String) -> LocalizedStringResource {
        .bfhr("oauth.title", default: "Connect \(provider)", table: "MailConnect", comment: "%@ = Gmail or Outlook.")
    }
    static let promiseFindTitle = LocalizedStringResource.bfhr("oauth.promise.find.title", default: "Finds job emails.", table: "MailConnect")
    static let promiseFindBody = LocalizedStringResource.bfhr("oauth.promise.find.body", default: "We look for messages from employers and job sites. Other emails are skipped, and we never store them.", table: "MailConnect")
    static let promiseLookbackTitle = LocalizedStringResource.bfhr("oauth.promise.lookback.title", default: "Looks back as far as you choose.", table: "MailConnect")
    static let promiseAITitle = LocalizedStringResource.bfhr("oauth.promise.ai.title", default: "You decide about AI.", table: "MailConnect")
    static let promiseAIBody = LocalizedStringResource.bfhr("oauth.promise.ai.body", default: "We sort emails with rules. Only if you allow it in Settings does Anthropic Claude read job emails to sort them. Nothing changes without a reason you can see and undo.", table: "MailConnect")
    static let promiseDisconnectTitle = LocalizedStringResource.bfhr("oauth.promise.disconnect.title", default: "Disconnect anytime.", table: "MailConnect")
    static let promiseDisconnectBody = LocalizedStringResource.bfhr("oauth.promise.disconnect.body", default: "We remove our access and delete this account's mail data.", table: "MailConnect")
    static func expectation(_ provider: String, scope: String) -> LocalizedStringResource {
        .bfhr("oauth.expectation", default: "\(provider) will ask what BruteForceHR can access. Keep “\(scope)” checked, or we can't find your applications.", table: "MailConnect", comment: "%1$@ = Google or Microsoft, %2$@ = the permission's label on that screen.")
    }
    static let googleScope = LocalizedStringResource.bfhr("oauth.scope.google", default: "View your email messages and settings", table: "MailConnect", comment: "Google's own label for the read-only Gmail permission, in the language Google shows it.")
    static let microsoftScope = LocalizedStringResource.bfhr("oauth.scope.microsoft", default: "Read your mail", table: "MailConnect", comment: "Microsoft's own label for Mail.Read.")
    static let googleUnverified = LocalizedStringResource.bfhr("oauth.unverified", default: "Google may say it hasn't verified this app. That's expected for this personal app: choose Advanced, then Go to BruteForceHR.", table: "MailConnect")
    static let microsoftKeepAccess = LocalizedStringResource.bfhr("oauth.keepAccess", default: "Microsoft also asks to keep access. That lets us check for new emails every few minutes.", table: "MailConnect")
    static func continueTo(_ provider: String) -> LocalizedStringResource {
        .bfhr("oauth.continue", default: "Continue to \(provider)", table: "MailConnect", comment: "%@ = Google or Microsoft.")
    }
    static func notConfiguredTitle(_ provider: String) -> LocalizedStringResource {
        .bfhr("oauth.notConfigured.title", default: "Signing in with \(provider) isn't set up yet", table: "MailConnect", comment: "%@ = Google or Microsoft. Calm: not an error the user caused.")
    }
    static let notConfiguredGoogle = LocalizedStringResource.bfhr("oauth.notConfigured.google", default: "You can connect Gmail now with an app password instead. It takes about two minutes.", table: "MailConnect")
    static let notConfiguredMicrosoft = LocalizedStringResource.bfhr("oauth.notConfigured.microsoft", default: "Outlook.com only allows Microsoft sign-in, so it will work once that's turned on. Other providers work now.", table: "MailConnect")
    static let useAppPassword = LocalizedStringResource.bfhr("oauth.useAppPassword", default: "Use an app password", table: "MailConnect")
    static let chooseAnother = LocalizedStringResource.bfhr("oauth.chooseAnother", default: "Choose another provider", table: "MailConnect")
    static let working = LocalizedStringResource.bfhr("oauth.working", default: "Waiting for the sign-in to finish…", table: "MailConnect")

    // Lookback
    static let lookback = LocalizedStringResource.bfhr("lookback.label", default: "Look back", table: "MailConnect")
    static func lookbackDays(_ days: Int) -> LocalizedStringResource {
        .bfhr("lookback.days", default: "\(days) days", table: "MailConnect", comment: "%lld = 30, 90 or 180.")
    }
    static func lookbackSince(_ date: String) -> LocalizedStringResource {
        .bfhr("lookback.since", default: "Since \(date)", table: "MailConnect", comment: "%@ = absolute start date of the lookback window.")
    }

    // App password (Screen C)
    static func appPasswordTitle(_ provider: String) -> LocalizedStringResource {
        .bfhr("imap.title", default: "Connect \(provider)", table: "MailConnect", comment: "%@ = provider label, e.g. iCloud Mail.")
    }
    static let otherTitleForm = LocalizedStringResource.bfhr("imap.title.other", default: "Connect with IMAP", table: "MailConnect")
    static let helpHeader = LocalizedStringResource.bfhr("imap.help.header", default: "Create an app password", table: "MailConnect")
    static func helpOpen(_ provider: String) -> LocalizedStringResource {
        .bfhr("imap.help.step1", default: "Open the security settings of your \(provider) account.", table: "MailConnect", comment: "%@ = provider label.")
    }
    static let helpCreate = LocalizedStringResource.bfhr("imap.help.step2", default: "Create an app password named BruteForceHR. If you don't see the option, turn on two-step verification first.", table: "MailConnect")
    static let helpPaste = LocalizedStringResource.bfhr("imap.help.step3", default: "Copy it and paste it below. It's different from your normal password.", table: "MailConnect")
    static func helpImapAccess(_ provider: String) -> LocalizedStringResource {
        .bfhr("imap.help.imapAccess", default: "Also turn on POP3/IMAP access in your \(provider) mail settings.", table: "MailConnect", comment: "GMX and WEB.DE keep IMAP off until the user turns it on. %@ = provider label.")
    }
    static func openSettings(_ provider: String) -> LocalizedStringResource {
        .bfhr("imap.help.open", default: "Open \(provider) settings", table: "MailConnect", comment: "%@ = provider label.")
    }
    static let helpOther = LocalizedStringResource.bfhr("imap.help.other", default: "Ask your provider for its IMAP settings and an app password.", table: "MailConnect")
    static let address = LocalizedStringResource.bfhr("imap.field.address", default: "Email address", table: "MailConnect")
    static let yourAccount = LocalizedStringResource.bfhr("imap.section.account", default: "Your account", table: "MailConnect")
    static let appPassword = LocalizedStringResource.bfhr("imap.field.password", default: "App password", table: "MailConnect")
    static let passwordCaption = LocalizedStringResource.bfhr("imap.field.passwordCaption", default: "Not your regular password: the one you just created.", table: "MailConnect")
    static let showPassword = LocalizedStringResource.bfhr("imap.field.show", default: "Show password", table: "MailConnect")
    static let hidePassword = LocalizedStringResource.bfhr("imap.field.hide", default: "Hide password", table: "MailConnect")
    static let outlookNeedsOAuthTitle = LocalizedStringResource.bfhr("imap.outlook.title", default: "Outlook.com connects with Microsoft sign-in", table: "MailConnect")
    static let outlookNeedsOAuthBody = LocalizedStringResource.bfhr("imap.outlook.body", default: "Microsoft turned off app passwords for Outlook.com.", table: "MailConnect")
    static let useMicrosoft = LocalizedStringResource.bfhr("imap.outlook.action", default: "Use Microsoft sign-in", table: "MailConnect")
    static let serverSettings = LocalizedStringResource.bfhr("imap.server", default: "Server settings", table: "MailConnect")
    static let username = LocalizedStringResource.bfhr("imap.server.username", default: "Username", table: "MailConnect")
    static let usernamePrompt = LocalizedStringResource.bfhr("imap.server.usernamePrompt", default: "Same as the email address", table: "MailConnect")
    static let incoming = LocalizedStringResource.bfhr("imap.server.incoming", default: "Incoming server (IMAP)", table: "MailConnect")
    static let outgoing = LocalizedStringResource.bfhr("imap.server.outgoing", default: "Outgoing server (SMTP)", table: "MailConnect")
    static let host = LocalizedStringResource.bfhr("imap.server.host", default: "Server", table: "MailConnect")
    static let port = LocalizedStringResource.bfhr("imap.server.port", default: "Port", table: "MailConnect")
    static let security = LocalizedStringResource.bfhr("imap.server.security", default: "Security", table: "MailConnect")
    static let securityTLS = LocalizedStringResource.bfhr("imap.server.tls", default: "SSL/TLS", table: "MailConnect")
    static let securitySTARTTLS = LocalizedStringResource.bfhr("imap.server.starttls", default: "STARTTLS", table: "MailConnect")
    static let outgoingOptional = LocalizedStringResource.bfhr("imap.server.outgoingFooter", default: "Leave the outgoing server empty to connect for reading only.", table: "MailConnect")
    static let connect = LocalizedStringResource.bfhr("imap.connect", default: "Connect", table: "MailConnect")
    static let testing = LocalizedStringResource.bfhr("imap.testing", default: "Testing connection…", table: "MailConnect")
    static let imapTrust = LocalizedStringResource.bfhr("imap.trust", default: "Sent once over an encrypted connection, tested, then stored encrypted. We never show it again.", table: "MailConnect")

    // Errors (what happened + how to fix)
    static let errorAuth = LocalizedStringResource.bfhr("imap.error.auth", default: "We couldn't sign in with this app password. Check it was copied in full. Your regular password won't work here.", table: "MailConnect")
    static let errorImapDisabled = LocalizedStringResource.bfhr("imap.error.imapDisabled", default: "IMAP access is turned off for this account. Turn it on in your provider's mail settings, then try again.", table: "MailConnect")
    static func errorHost(_ host: String, port: Int) -> LocalizedStringResource {
        .bfhr("imap.error.host", default: "Can't reach \(host) on port \(port). Check the server name and port.", table: "MailConnect", comment: "%1$@ = host, %2$lld = port.")
    }
    static let errorTLS = LocalizedStringResource.bfhr("imap.error.tls", default: "The server's security certificate couldn't be verified. Check the security setting or ask your provider.", table: "MailConnect")
    static let errorUnverified = LocalizedStringResource.bfhr("error.unverified", default: "Confirm your sign-in email first, then try again.", table: "MailConnect")
    static let errorAccountGone = LocalizedStringResource.bfhr("error.accountGone", default: "This account was disconnected. Add it again from Settings.", table: "MailConnect")
    static let errorOffline = LocalizedStringResource.bfhr("error.offline", default: "You're offline. Connecting needs an internet connection.", table: "MailConnect")
    static let errorFailed = LocalizedStringResource.bfhr("error.failed", default: "We couldn't finish connecting. Nothing was saved. Try again in a moment.", table: "MailConnect")
    static let errorScope = LocalizedStringResource.bfhr("error.scope", default: "BruteForceHR didn't get permission to read your email. Try again and keep the mail permission checked.", table: "MailConnect")
    static let errorAdmin = LocalizedStringResource.bfhr("error.admin", default: "Your organization needs to approve BruteForceHR before it can read this mailbox. Ask your IT admin, or connect a personal account instead.", table: "MailConnect")
    static let errorExpired = LocalizedStringResource.bfhr("error.expired", default: "The sign-in took too long. Try again.", table: "MailConnect")
    static let errorPortNotAllowed = LocalizedStringResource.bfhr("imap.error.port", default: "Use port 993 with SSL/TLS or 143 with STARTTLS for incoming mail, and 465 with SSL/TLS or 587 with STARTTLS for outgoing mail.", table: "MailConnect")
    static let errorTooManyAttempts = LocalizedStringResource.bfhr("error.tooManyAttempts", default: "We've paused connection tests for today after several tries. Try again tomorrow.", table: "MailConnect")
    static func reconnectedTo(_ address: String) -> LocalizedStringResource {
        .bfhr("scan.reconnected", default: "Reconnected \(address)", table: "MailConnect", comment: "%@ = address.")
    }
    static let reconnectedBody = LocalizedStringResource.bfhr("scan.reconnected.body", default: "We'll pick up new emails from here. Emails we already stored stay as they are.", table: "MailConnect")
    static let errorWrongUser = LocalizedStringResource.bfhr("error.wrongUser", default: "That sign-in belongs to another BruteForceHR account, so nothing was saved. Try again from this account.", table: "MailConnect")

    // Scan (Screen D/E)
    static func connectedTo(_ address: String) -> LocalizedStringResource {
        .bfhr("scan.connected", default: "Connected to \(address)", table: "MailConnect", comment: "%@ = address.")
    }
    static let finishing = LocalizedStringResource.bfhr("scan.finishing", default: "Finishing the connection…", table: "MailConnect")
    static let smtpWarning = LocalizedStringResource.bfhr("scan.smtpWarning", default: "Connected for reading. Sending from this account needs working outgoing (SMTP) settings.", table: "MailConnect")
    static func stageScanning(_ days: Int) -> LocalizedStringResource {
        .bfhr("scan.stage.scanning", default: "Checking the last \(days) days", table: "MailConnect", comment: "%lld = lookback days.")
    }
    static let stageClassifying = LocalizedStringResource.bfhr("scan.stage.classifying", default: "Finding job-related emails", table: "MailConnect")
    static let stageMatching = LocalizedStringResource.bfhr("scan.stage.matching", default: "Matching companies and roles", table: "MailConnect")
    static let stagePreparing = LocalizedStringResource.bfhr("scan.stage.preparing", default: "Preparing your review", table: "MailConnect")
    static func checked(_ count: Int) -> LocalizedStringResource {
        .bfhr("scan.checked", default: "Emails checked: \(count)", table: "MailConnect", comment: "%lld = count.")
    }
    static let stageDone = LocalizedStringResource.bfhr("scan.stage.done", default: "Done", table: "MailConnect")
    static let stageCurrent = LocalizedStringResource.bfhr("scan.stage.current", default: "In progress", table: "MailConnect")
    static let stagePending = LocalizedStringResource.bfhr("scan.stage.pending", default: "Not started", table: "MailConnect")
    static let leave = LocalizedStringResource.bfhr("scan.leave", default: "This can take a few minutes. You can keep going: new emails show up in Mail as we find them.", table: "MailConnect")
    static let continueAction = LocalizedStringResource.bfhr("scan.continue", default: "Continue", table: "MailConnect")
    static let resultTitle = LocalizedStringResource.bfhr("scan.result.title", default: "Your inbox check is done", table: "MailConnect")
    static let resultApplications = LocalizedStringResource.bfhr("scan.result.applicationsLabel", default: "Applications found", table: "MailConnect")
    static let resultInvites = LocalizedStringResource.bfhr("scan.result.invitesLabel", default: "Interview invites", table: "MailConnect")
    static let resultAlerts = LocalizedStringResource.bfhr("scan.result.alertsLabel", default: "Job alerts sent to Jobs", table: "MailConnect")
    static let resultPending = LocalizedStringResource.bfhr("scan.result.pendingLabel", default: "Waiting for your review", table: "MailConnect")
    static let resultFooter = LocalizedStringResource.bfhr("scan.result.footer", default: "Changes we were sure about are already in your Tracker, each with its source and Undo.", table: "MailConnect")
    static let reviewNow = LocalizedStringResource.bfhr("scan.reviewNow", default: "Review emails", table: "MailConnect")
    static func emptyTitle(_ days: Int) -> LocalizedStringResource {
        .bfhr("scan.empty.title", default: "No job emails in the last \(days) days", table: "MailConnect", comment: "%lld = lookback days.")
    }
    static let emptyBody = LocalizedStringResource.bfhr("scan.empty.body", default: "New ones will show up in Mail as they arrive.", table: "MailConnect")
    static let scanLonger = LocalizedStringResource.bfhr("scan.empty.longer", default: "Check the last 180 days", table: "MailConnect")
    static func failedTitle(_ address: String) -> LocalizedStringResource {
        .bfhr("scan.failed.title", default: "We couldn't finish checking \(address)", table: "MailConnect", comment: "%@ = address.")
    }
    static let failedBody = LocalizedStringResource.bfhr("scan.failed.body", default: "Your account is connected, and we'll keep checking new mail.", table: "MailConnect")
    static let retry = LocalizedStringResource.bfhr("scan.failed.retry", default: "Try the check again", table: "MailConnect")
    static let retryFailed = LocalizedStringResource.bfhr("scan.failed.retryFailed", default: "That didn't start. Try again in a moment.", table: "MailConnect")

    /// The copy for a connect error (field errors and the OAuth sheet's banner).
    static func message(for error: MailConnectError, imap: MailEndpoint, smtp: MailEndpoint) -> LocalizedStringResource? {
        switch error {
        case .authFailed: errorAuth
        case .imapDisabled: errorImapDisabled
        case .hostUnreachable(let field): field == .smtpHost ? errorHost(smtp.host, port: smtp.port) : errorHost(imap.host, port: imap.port)
        case .tlsFailed: errorTLS
        case .emailUnverified: errorUnverified
        case .accountNotFound: errorAccountGone
        case .offline: errorOffline
        case .scopeMissing: errorScope
        case .adminConsentRequired: errorAdmin
        case .expired: errorExpired
        case .wrongUser: errorWrongUser
        case .portNotAllowed: errorPortNotAllowed
        case .tooManyAttempts: errorTooManyAttempts
        case .cancelled, .providerNotConfigured, .oauthRequired: nil
        case .failed: errorFailed
        }
    }
}
