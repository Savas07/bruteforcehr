import Foundation

// Mail contracts of @bfhr/core (`src/mail/connect.ts`, `src/mail/decision.ts`) the iOS connect
// flow and review queue need, proven against `packages/core/conformance/mail.json`.

/// Lookback choices of the connect flow (connect-email.md Screen B).
public let mailLookbackDays = [30, 90, 180]
public let defaultMailLookbackDays = 90

/// OAuth providers of `mailConnectStart` (`OAuthMailProviderSchema`).
public enum OAuthMailProvider: String, Codable, Hashable, Sendable, CaseIterable {
    case google
    case microsoft
}

/// An app-password preset (`IMAP_PRESETS`): servers, the domains that select it, and where the
/// user creates an app password.
public struct ImapPreset: Codable, Hashable, Sendable, Identifiable {
    public enum OAuthOnly: String, Codable, Hashable, Sendable {
        case gmail
        case microsoft
    }

    public var id: String
    public var label: String
    public var domains: [String]
    public var imap: MailEndpoint
    public var smtp: MailEndpoint
    /// The provider no longer accepts app passwords over IMAP: the form routes to OAuth.
    public var oauthOnly: OAuthOnly?
    public var appPasswordUrl: String?

    public init(id: String, label: String, domains: [String], imap: MailEndpoint, smtp: MailEndpoint, oauthOnly: OAuthOnly?, appPasswordUrl: String?) {
        self.id = id
        self.label = label
        self.domains = domains
        self.imap = imap
        self.smtp = smtp
        self.oauthOnly = oauthOnly
        self.appPasswordUrl = appPasswordUrl
    }

    /// The `other` preset id: servers typed by the user.
    public static let otherID = "other"

    public static let all: [ImapPreset] = [
        ImapPreset(
            id: "gmail", label: "Gmail", domains: ["gmail.com", "googlemail.com"],
            imap: .tls("imap.gmail.com"), smtp: .tls("smtp.gmail.com", port: 465),
            oauthOnly: nil, appPasswordUrl: "https://myaccount.google.com/apppasswords"
        ),
        ImapPreset(
            id: "icloud", label: "iCloud Mail", domains: ["icloud.com", "me.com", "mac.com"],
            imap: .tls("imap.mail.me.com"), smtp: .starttls("smtp.mail.me.com"),
            oauthOnly: nil, appPasswordUrl: "https://account.apple.com/account/manage"
        ),
        ImapPreset(
            id: "outlook", label: "Outlook.com",
            domains: ["outlook.com", "hotmail.com", "live.com", "msn.com", "outlook.de", "hotmail.de", "outlook.com.tr"],
            imap: .tls("outlook.office365.com"), smtp: .starttls("smtp-mail.outlook.com"),
            oauthOnly: .microsoft, appPasswordUrl: nil
        ),
        ImapPreset(
            id: "yahoo", label: "Yahoo Mail", domains: ["yahoo.com", "yahoo.co.uk", "yahoo.de", "ymail.com", "rocketmail.com"],
            imap: .tls("imap.mail.yahoo.com"), smtp: .tls("smtp.mail.yahoo.com", port: 465),
            oauthOnly: nil, appPasswordUrl: "https://login.yahoo.com/account/security"
        ),
        ImapPreset(
            id: "yandex", label: "Yandex Mail", domains: ["yandex.com", "yandex.ru", "yandex.com.tr", "ya.ru"],
            imap: .tls("imap.yandex.com"), smtp: .tls("smtp.yandex.com", port: 465),
            oauthOnly: nil, appPasswordUrl: "https://id.yandex.com/security/app-passwords"
        ),
        ImapPreset(
            id: "gmx", label: "GMX", domains: ["gmx.de", "gmx.net", "gmx.at", "gmx.ch", "gmx.com"],
            imap: .tls("imap.gmx.net"), smtp: .starttls("mail.gmx.net"),
            oauthOnly: nil, appPasswordUrl: "https://www.gmx.net/mein-account/"
        ),
        ImapPreset(
            id: "webde", label: "WEB.DE", domains: ["web.de"],
            imap: .tls("imap.web.de"), smtp: .starttls("smtp.web.de"),
            oauthOnly: nil, appPasswordUrl: "https://web.de/mein-account/"
        ),
    ]

    /// The preset for an address by its domain (case-insensitive), or nil ("Other (IMAP)").
    public static func preset(for address: String) -> ImapPreset? {
        guard let at = address.lastIndex(of: "@") else { return nil }
        let domain = address[address.index(after: at)...].lowercased()
        return all.first { $0.domains.contains(domain) }
    }

    public static func preset(id: String) -> ImapPreset? {
        all.first { $0.id == id }
    }
}

/// Which side of a mailbox an endpoint serves (`MAIL_ENDPOINT_PORTS`).
public enum MailEndpointKind: String, Codable, Hashable, Sendable, CaseIterable {
    case imap
    case smtp
}

/// The port/security pairs `mailConnectImap` accepts (`MAIL_ENDPOINT_PORTS`).
public let mailEndpointPorts: [MailEndpointKind: [MailEndpoint.PortSecurity]] = [
    .imap: [.init(port: 993, security: .tls), .init(port: 143, security: .starttls)],
    .smtp: [.init(port: 465, security: .tls), .init(port: 587, security: .starttls)],
]

extension MailEndpoint {
    public struct PortSecurity: Codable, Hashable, Sendable {
        public var port: Int
        public var security: MailSecurity

        public init(port: Int, security: MailSecurity) {
            self.port = port
            self.security = security
        }
    }

    /// The endpoint uses an allowed port/security pair (`mailEndpointAllowed`).
    public func isAllowed(as kind: MailEndpointKind) -> Bool {
        mailEndpointPorts[kind]?.contains(PortSecurity(port: port, security: security)) ?? false
    }

    /// The usual port for a security on this side (993/143, 465/587).
    public static func defaultPort(_ kind: MailEndpointKind, security: MailSecurity) -> Int {
        mailEndpointPorts[kind]?.first { $0.security == security }?.port ?? 993
    }

    /// Implicit TLS (IMAP 993 by default).
    public static func tls(_ host: String, port: Int = 993) -> MailEndpoint {
        MailEndpoint(host: host, port: port, security: .tls)
    }

    /// STARTTLS (SMTP submission 587 by default).
    public static func starttls(_ host: String, port: Int = 587) -> MailEndpoint {
        MailEndpoint(host: host, port: port, security: .starttls)
    }
}

/// The status a category moves an application to (`categoryTargetStatus`); `screening` marks a
/// first screen.
public func categoryTargetStatus(_ category: MailCategory, screening: Bool) -> ApplicationStatus? {
    switch category {
    case .applicationReceived: .acknowledged
    case .rejection: .rejected
    case .interviewInvite: screening ? .screening : .interviewing
    case .assessment: .screening
    case .offer: .offer
    case .recruiterOutreach, .infoRequest, .jobAlert, .otherJob, .notJob: nil
    }
}

/// The move the review trigger makes when the user confirms or corrects a pending email
/// (`mailMessageReviewed`, ADR 0012): the email's proposal while the category is unchanged, else
/// the category's target; applied as the user's change only when it moves the application forward
/// or to a side exit. nil: the email is filed without a status change.
public func reviewMoveTarget(
    category: MailCategory,
    previousCategory: MailCategory,
    suggestedStatus: ApplicationStatus?,
    applicationStatus: ApplicationStatus
) -> ApplicationStatus? {
    let target = category == previousCategory && suggestedStatus != nil
        ? suggestedStatus
        : categoryTargetStatus(category, screening: false)
    guard let target else { return nil }
    switch canTransition(from: applicationStatus, to: target, actor: .user) {
    case .allowed(.forward), .allowed(.exit): return target
    default: return nil
    }
}
