#if DEBUG
import BFHRCore
import BFHRUIFixtures
import Foundation
import SwiftUI

// Design mode for Connect email (Debug builds only): `-BFHRScreen mail-connect` opens the sheet
// over the Mail tab; `-BFHRConnectStep <step>` picks the step:
//   providers, google, google-not-configured, microsoft-not-configured, google-scope-error,
//   imap, imap-filled, imap-error, imap-host-error, imap-testing, outlook-address,
//   scanning, done, done-empty, failed, reconnect
// The callables are fakes: Google and Microsoft answer `provider_not_configured` (as the live
// project does until the OAuth clients exist), IMAP connects. Release builds compile none of this.

/// Fake callables for design mode and previews.
final class DesignMailService: MailConnectService {
    func startOAuth(provider: OAuthMailProvider, lookbackDays: Int, address: String?) async throws(MailConnectError) -> URL {
        throw .providerNotConfigured
    }

    func finishOAuth(nonce: String, handoff: String) async throws(MailConnectError) -> String {
        throw .providerNotConfigured
    }

    func connectImap(_ request: ImapConnectRequest) async throws(MailConnectError) -> ImapConnectResult {
        try? await Task.sleep(for: .seconds(1))
        return ImapConnectResult(accountId: "acc-design", canSend: true, smtpWarning: nil)
    }

    func startBackfill(accountId: String, lookbackDays: Int) async throws(MailConnectError) {}
    func syncNow(accountId: String) async throws(MailConnectError) {}
    func disconnect(accountId: String) async throws(MailConnectError) -> Int { 0 }
}

public enum DesignMailConnect {
    /// The step `-BFHRConnectStep` asks for (default: the provider list).
    public static var step: String {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-BFHRConnectStep"), arguments.indices.contains(index + 1) else { return "providers" }
        return arguments[index + 1]
    }

    /// Connect email on the fakes, for every screen that offers it in design mode.
    public static let launcher = MailConnectLauncher { reconnecting in
        MailConnectModel(service: DesignMailService(), oauthSession: nil, reconnecting: reconnecting, now: { scenario.now })
    }

    private static var scenario: DesignScenario { DesignScenario.launch ?? DesignScenario() }

    /// A model on `step`, with the scan's account from the fixtures.
    public static func model(step: String = step) -> MailConnectModel {
        let scenario = scenario
        let document = scenario.document
        let reconnecting = step == "reconnect" ? document.mailAccounts.first { $0.id == "acc-icloud" } : nil
        let model = MailConnectModel(service: DesignMailService(), oauthSession: nil, reconnecting: reconnecting, now: { scenario.now })
        switch step {
        case "google": model.chooseOAuth(.google)
        case "google-not-configured":
            model.chooseOAuth(.google)
            model.designSet(oauth: .notConfigured, unavailable: [.google])
        case "microsoft-not-configured":
            model.chooseOAuth(.microsoft)
            model.designSet(oauth: .notConfigured, unavailable: [.google, .microsoft])
        case "google-scope-error":
            model.chooseOAuth(.google)
            model.designSet(oauth: .failed(.scopeMissing), unavailable: [])
        case "imap": model.chooseAppPassword("icloud")
        case "imap-filled", "imap-error", "imap-host-error", "imap-testing":
            model.chooseAppPassword(step == "imap-host-error" ? ImapPreset.otherID : "icloud")
            model.address = step == "imap-host-error" ? "deniz@posteo.example" : "deniz.aksoy@icloud.com"
            model.password = "abcd-efgh-ijkl-mnop"
            if step == "imap-host-error" {
                model.imap = MailEndpoint(host: "mail.posteo.example", port: 993, security: .tls)
                model.smtp = MailEndpoint(host: "mail.posteo.example", port: 587, security: .starttls)
            }
            switch step {
            case "imap-error": model.designSet(form: .failed(.authFailed))
            case "imap-host-error": model.designSet(form: .failed(.hostUnreachable(field: .imapHost)))
            case "imap-testing": model.designSet(form: .testing)
            default: break
            }
        case "outlook-address":
            model.chooseAppPassword(ImapPreset.otherID)
            model.address = "deniz.aksoy@hotmail.com"
        case "scanning", "done", "done-empty", "failed":
            var account = document.mailAccounts.first { $0.id == "acc-gmail" } ?? document.mailAccounts[0]
            account.id = "acc-design"
            let state: MailBackfillState = switch step {
            case "scanning": .running
            case "failed": .failed
            default: .done
            }
            let empty = step == "done-empty"
            account.backfill = MailBackfill(
                state: state, stage: .classifying, lookbackDays: 90,
                since: scenario.now.addingTimeInterval(-90 * 86_400), scanned: 1_240, total: nil,
                jobMessages: empty ? 0 : 23, applications: empty ? 0 : 14, interviewInvites: empty ? 0 : 3,
                jobAlerts: empty ? 0 : 5, pendingReview: empty ? 0 : 4,
                startedAt: scenario.now.addingTimeInterval(-120), finishedAt: state == .done ? scenario.now : nil,
                error: state == .failed ? .init(code: "provider_unavailable", message: "") : nil
            )
            model.chooseAppPassword("gmail")
            model.designConnected(account)
        default: break
        }
        return model
    }
}

extension MailConnectModel {
    func designSet(oauth: OAuthState, unavailable: Set<OAuthMailProvider>) {
        oauthState = oauth
        unavailableProviders = unavailable
    }

    func designSet(form: FormState) {
        formState = form
    }

    func designConnected(_ account: MailAccount) {
        load([account])
        connectedAccountId = account.id
        path.append(.scanning)
    }
}

/// The Mail tab with Connect email presented on the launch step (`-BFHRScreen mail-connect`).
struct DesignMailConnectScreen: View {
    let mail: MailReviewModel
    @State private var model = DesignMailConnect.model()
    @State private var presented = true

    var body: some View {
        MailReviewScreen(model: mail)
            .sheet(isPresented: $presented) {
                MailConnectSheet(model: model) {}
            }
    }
}
#endif
