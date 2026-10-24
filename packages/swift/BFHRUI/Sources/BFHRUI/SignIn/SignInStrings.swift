import Foundation

/// Copy of the sign-in screens and the account menu (table "SignIn"; adapted from
/// docs/design/research/onboarding-signin.md, "Copy notes", from a code to a link).
enum SignInStrings {
    // MARK: Email

    static let title = LocalizedStringResource.bfhr(
        "signIn.title", default: "Sign in to BruteForceHR", table: "SignIn",
        comment: "Title of the first screen while signed out. BruteForceHR is the app name."
    )
    static let body = LocalizedStringResource.bfhr(
        "signIn.body", default: "We'll email you a link to sign in. No password needed.", table: "SignIn",
        comment: "Under the title: how sign-in works."
    )
    static let emailLabel = LocalizedStringResource.bfhr(
        "signIn.email.label", default: "Email", table: "SignIn",
        comment: "Label above the email address field."
    )
    static let emailPlaceholder = LocalizedStringResource.bfhr(
        "signIn.email.placeholder", default: "name@example.com", table: "SignIn",
        comment: "Placeholder in the empty email field. Keep an example address."
    )
    static let sendLink = LocalizedStringResource.bfhr(
        "signIn.action.sendLink", default: "Send link", table: "SignIn",
        comment: "Primary button: emails the sign-in link."
    )
    static let sending = LocalizedStringResource.bfhr(
        "signIn.sending", default: "Sending…", table: "SignIn",
        comment: "Primary button label while the link is being sent."
    )
    static let legal = LocalizedStringResource.bfhr(
        "signIn.legal",
        default: "By continuing, you agree to the [Terms](https://bruteforcehr.web.app/terms/) and the [Privacy Policy](https://bruteforcehr.web.app/privacy/).",
        table: "SignIn",
        comment: "Footnote under the button. Markdown links: keep both URLs unchanged (the pages are in English only)."
    )

    // MARK: Field and send errors

    static let invalidFormat = LocalizedStringResource.bfhr(
        "signIn.error.invalidFormat", default: "Enter a full email address, like name@example.com.", table: "SignIn",
        comment: "Inline under the field after Send when the text isn't an email address."
    )
    static let rejected = LocalizedStringResource.bfhr(
        "signIn.error.rejected", default: "This address can't receive a sign-in link. Check it for typos.", table: "SignIn",
        comment: "Inline under the field when Firebase rejects the address."
    )
    static let mismatch = LocalizedStringResource.bfhr(
        "signIn.error.mismatch", default: "This link went to a different address. Enter the email you asked with.", table: "SignIn",
        comment: "Confirm-email step: the typed address isn't the one the link was sent to."
    )
    static let sendOfflineTitle = LocalizedStringResource.bfhr(
        "signIn.sendError.offline.title", default: "We couldn't send the link", table: "SignIn",
        comment: "Alert title under the button when sending failed for lack of connection."
    )
    static let sendOfflineMessage = LocalizedStringResource.bfhr(
        "signIn.sendError.offline.message", default: "Check your connection and try again.", table: "SignIn",
        comment: "Alert message: what to do."
    )
    static let sendTooManyTitle = LocalizedStringResource.bfhr(
        "signIn.sendError.tooMany.title", default: "Several links were sent just now", table: "SignIn",
        comment: "Alert title when Firebase limits how many links go to one address."
    )
    static let sendTooManyMessage = LocalizedStringResource.bfhr(
        "signIn.sendError.tooMany.message", default: "Wait a few minutes, then try again. The last link still works.", table: "SignIn",
        comment: "Alert message for the send limit."
    )
    static let sendOtherTitle = LocalizedStringResource.bfhr(
        "signIn.sendError.other.title", default: "The link didn't go out", table: "SignIn",
        comment: "Alert title for an unexpected send failure."
    )
    static let sendOtherMessage = LocalizedStringResource.bfhr(
        "signIn.sendError.other.message", default: "Something went wrong on our side. Try again in a moment.", table: "SignIn",
        comment: "Alert message for an unexpected send failure."
    )

    // MARK: Check your email

    static let checkTitle = LocalizedStringResource.bfhr(
        "signIn.check.title", default: "Check your email", table: "SignIn",
        comment: "Title after the link was sent."
    )

    static func checkBody(_ email: String) -> LocalizedStringResource {
        .bfhr(
            "signIn.check.body", default: "We sent a sign-in link to **\(email)**.", table: "SignIn",
            comment: "%@ = the email address the link went to, in bold (Markdown **…**: keep the asterisks around it)."
        )
    }

    static let checkDevice = LocalizedStringResource.bfhr(
        "signIn.check.device", default: "Open it on this iPhone to finish signing in.", table: "SignIn",
        comment: "The link only completes sign-in on the device that asked for it."
    )
    static let checkHelper = LocalizedStringResource.bfhr(
        "signIn.check.helper", default: "It can take a minute to arrive. Check Spam if you don't see it.", table: "SignIn",
        comment: "Secondary hint under the body."
    )
    static let resent = LocalizedStringResource.bfhr(
        "signIn.check.resent", default: "We sent another link. Use the newest one.", table: "SignIn",
        comment: "Confirmation after Resend link."
    )
    static let openMail = LocalizedStringResource.bfhr(
        "signIn.action.openMail", default: "Open Mail", table: "SignIn",
        comment: "Opens Apple's Mail app. Mail is the app's name."
    )
    static let resend = LocalizedStringResource.bfhr(
        "signIn.action.resend", default: "Resend link", table: "SignIn",
        comment: "Sends another sign-in link to the same address."
    )

    static func resendIn(_ time: String) -> LocalizedStringResource {
        .bfhr(
            "signIn.action.resendIn", default: "Resend link (\(time))", table: "SignIn",
            comment: "Disabled Resend during the cooldown. %@ = remaining time, e.g. 0:42."
        )
    }

    static func resendAvailableIn(_ seconds: Int) -> LocalizedStringResource {
        .bfhr(
            "signIn.action.resendIn.accessibility", default: "Available in \(seconds) seconds", table: "SignIn",
            comment: "VoiceOver value of the disabled Resend button. %lld = seconds left."
        )
    }

    static let differentEmail = LocalizedStringResource.bfhr(
        "signIn.action.differentEmail", default: "Use a different email", table: "SignIn",
        comment: "Back to the email field to change the address."
    )

    // MARK: Finishing and confirming

    static let finishing = LocalizedStringResource.bfhr(
        "signIn.finishing", default: "Signing you in…", table: "SignIn",
        comment: "Shown while the opened link is being checked."
    )
    static let confirmTitle = LocalizedStringResource.bfhr(
        "signIn.confirm.title", default: "Confirm your email", table: "SignIn",
        comment: "Title when a link is opened on a device that didn't ask for it."
    )
    static let confirmBody = LocalizedStringResource.bfhr(
        "signIn.confirm.body",
        default: "This link was requested on another device. Enter the same email address to finish signing in on this iPhone.",
        table: "SignIn",
        comment: "Why the address is asked again (Firebase requires it for a link from another device)."
    )
    static let confirmAction = LocalizedStringResource.bfhr(
        "signIn.action.signIn", default: "Sign in", table: "SignIn",
        comment: "Primary button of the confirm-email step."
    )
    static let signingIn = LocalizedStringResource.bfhr(
        "signIn.signingIn", default: "Signing in…", table: "SignIn",
        comment: "Primary button label while the confirm-email step signs in."
    )

    // MARK: Link problems

    static let expiredTitle = LocalizedStringResource.bfhr(
        "signIn.link.expired.title", default: "This link has expired", table: "SignIn",
        comment: "An opened sign-in link is past its expiry."
    )
    static let expiredMessage = LocalizedStringResource.bfhr(
        "signIn.link.expired.message", default: "Sign-in links only work for a while. Send yourself a new one.", table: "SignIn",
        comment: "What to do about an expired link."
    )
    static let unusableTitle = LocalizedStringResource.bfhr(
        "signIn.link.unusable.title", default: "This link doesn't work anymore", table: "SignIn",
        comment: "An opened link was used, replaced or is broken."
    )
    static let unusableMessage = LocalizedStringResource.bfhr(
        "signIn.link.unusable.message",
        default: "It may have been used already, or a newer link replaced it. Send yourself a new one.",
        table: "SignIn",
        comment: "Possible reasons, then what to do."
    )
    static let retryTitle = LocalizedStringResource.bfhr(
        "signIn.link.retry.title", default: "Signing in didn't finish", table: "SignIn",
        comment: "The link is fine but the connection or the server failed."
    )
    static let retryOfflineMessage = LocalizedStringResource.bfhr(
        "signIn.link.retry.offline", default: "You seem to be offline. Check your connection and try again. Your link still works.", table: "SignIn",
        comment: "Message when offline."
    )
    static let retryOtherMessage = LocalizedStringResource.bfhr(
        "signIn.link.retry.other", default: "Something went wrong on our side. Try again in a moment. Your link still works.", table: "SignIn",
        comment: "Message for a server error."
    )
    static let disabledTitle = LocalizedStringResource.bfhr(
        "signIn.link.disabled.title", default: "This account is turned off", table: "SignIn",
        comment: "The account was disabled by the owner."
    )
    static let disabledMessage = LocalizedStringResource.bfhr(
        "signIn.link.disabled.message", default: "Signing in isn't possible with this address right now. Get help if you didn't expect this.", table: "SignIn",
        comment: "What to do about a disabled account."
    )
    static let inviteOnlyTitle = LocalizedStringResource.bfhr(
        "signIn.link.inviteOnly.title", default: "BruteForceHR is invite-only for now", table: "SignIn",
        comment: "A new account was refused: the address isn't on the owner's invite list."
    )
    static let inviteOnlyMessage = LocalizedStringResource.bfhr(
        "signIn.link.inviteOnly.message", default: "This email address isn't on the list yet, so no account was created. Ask the owner to add your email, then send a new link.", table: "SignIn",
        comment: "What to do when sign-up is invite-only."
    )
    static let sendNewLink = LocalizedStringResource.bfhr(
        "signIn.action.sendNewLink", default: "Send a new link", table: "SignIn",
        comment: "From an expired or used link: back to the email field to send a fresh link."
    )
    static let getHelp = LocalizedStringResource.bfhr(
        "signIn.action.getHelp", default: "Get help", table: "SignIn",
        comment: "Opens the website's Support page."
    )

    // MARK: Account menu

    static let account = LocalizedStringResource.bfhr(
        "account.menu", default: "Account", table: "SignIn",
        comment: "VoiceOver label of the avatar button, which opens the account menu."
    )

    static func signedInAs(_ email: String) -> LocalizedStringResource {
        .bfhr(
            "account.signedInAs", default: "Signed in as \(email)", table: "SignIn",
            comment: "Account menu header. %@ = the account's email address."
        )
    }

    static let signOut = LocalizedStringResource.bfhr(
        "account.signOut", default: "Sign out", table: "SignIn",
        comment: "Account menu item."
    )
    static let signOutFailed = LocalizedStringResource.bfhr(
        "account.signOutFailed", default: "Couldn't sign out. Try again.", table: "SignIn",
        comment: "Toast when signing out failed (rare: the keychain refused)."
    )
}
