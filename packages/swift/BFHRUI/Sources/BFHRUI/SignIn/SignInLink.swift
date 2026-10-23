import Foundation

/// What an incoming URL means for email-link sign-in (ADR 0003).
///
/// Firebase emails a Hosting link that wraps its action URL:
/// `https://bruteforcehr.firebaseapp.com/__/auth/links?link=https://bruteforcehr.firebaseapp.com/__/auth/action?apiKey%3D…%26mode%3DsignIn%26oobCode%3D…%26continueUrl%3D…`
/// iOS receives it as a universal link (Associated Domains on both Hosting hosts). Other shapes
/// reach the app too: the action URL itself, the continue URL `https://bruteforcehr.web.app/auth/finish?…`
/// with the action parameters, and `bruteforcehr://auth/finish?link=<encoded URL>` from the
/// `/auth/finish` page when the link opened in a browser.
///
/// FirebaseAuth 13 only reads the outer query (`isSignIn(withEmailLink:)` doesn't unwrap `link=`),
/// so the app hands Firebase the innermost URL that carries `mode=signIn` and `oobCode`.
public nonisolated enum SignInLink: Equatable, Sendable {
    /// A sign-in link: `actionLink` is what `isSignIn(withEmailLink:)` and
    /// `signIn(withEmail:link:)` take.
    case signIn(actionLink: String)
    /// An auth path on our hosts that isn't a usable sign-in link (cut off, edited, another
    /// action such as a password reset): the "This link doesn't work" state.
    case unusable

    /// Hosts of the `bruteforcehr` Firebase Hosting site (one site, both default domains).
    static let hosts: Set<String> = ["bruteforcehr.firebaseapp.com", "bruteforcehr.web.app"]
    /// Firebase's link and action handlers, and the continue URL page.
    static let paths: Set<String> = ["/__/auth/links", "/__/auth/action", "/auth/finish"]
    /// How many `link=` wrappers are unwrapped; real links have one.
    private static let maxDepth = 3

    /// Nil when `url` isn't about sign-in (another universal link or a `bruteforcehr://` tab link),
    /// so other handlers can take it.
    public init?(url: URL) {
        guard Self.isAuthURL(url) else { return nil }
        self = Self.resolve(url, depth: 0) ?? .unusable
    }

    /// `https` on our hosts at one of the auth paths, or `bruteforcehr://auth/finish`.
    static func isAuthURL(_ url: URL) -> Bool {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return false }
        let scheme = components.scheme?.lowercased()
        let host = components.host?.lowercased()
        if scheme == "bruteforcehr" {
            return host == "auth" && normalized(components.path) == "/finish"
        }
        guard scheme == "https", let host, hosts.contains(host) else { return false }
        return paths.contains(normalized(components.path))
    }

    private static func normalized(_ path: String) -> String {
        path.count > 1 && path.hasSuffix("/") ? String(path.dropLast()) : path
    }

    private static func resolve(_ url: URL, depth: Int) -> SignInLink? {
        guard depth <= maxDepth, isAuthURL(url),
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
        else { return nil }
        func value(_ name: String) -> String? {
            items.first { $0.name == name }?.value.flatMap { $0.isEmpty ? nil : $0 }
        }
        if url.scheme?.lowercased() == "https", value("mode") == "signIn", value("oobCode") != nil {
            return .signIn(actionLink: url.absoluteString)
        }
        if let inner = value("link"), let innerURL = URL(string: inner) {
            return resolve(innerURL, depth: depth + 1)
        }
        return nil
    }
}

/// Basic email syntax, checked when the user sends (never while typing): one `@`, a non-empty
/// local part, a dotted domain, no spaces. Firebase validates the rest.
public nonisolated enum EmailAddress {
    /// The trimmed address, or nil when it can't be an address.
    public static func normalized(_ input: String) -> String? {
        let address = input.trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = address.split(separator: "@", omittingEmptySubsequences: false)
        guard parts.count == 2, !address.contains(where: \.isWhitespace) else { return nil }
        let local = parts[0], domain = parts[1]
        let labels = domain.split(separator: ".", omittingEmptySubsequences: false)
        guard !local.isEmpty, labels.count >= 2, labels.allSatisfy({ !$0.isEmpty }),
              labels.last.map({ $0.count >= 2 }) == true
        else { return nil }
        return address
    }
}
