import Foundation

/// A release version, `MAJOR.MINOR.PATCH` with an optional pre-release (`0.2.0-beta.1`), ordered
/// by SemVer 2.0 precedence (semver.org §11). The format of `@bfhr/core`'s `SemverSchema`
/// (`appConfig/{platform}.latestVersion` / `minSupportedVersion`); it also reads the app's
/// `CFBundleShortVersionString`, which may have one to three numeric parts (`1.2` = `1.2.0`).
/// Build metadata (`+…`) is ignored, as SemVer requires.
public nonisolated struct AppVersion: Comparable, Hashable, Sendable, CustomStringConvertible {
    public let major: Int
    public let minor: Int
    public let patch: Int
    /// Dot-separated pre-release identifiers; empty for a release.
    public let prerelease: [String]

    public init(major: Int, minor: Int, patch: Int, prerelease: [String] = []) {
        self.major = major
        self.minor = minor
        self.patch = patch
        self.prerelease = prerelease
    }

    /// Nil when `string` isn't a version: empty or non-numeric parts, more than three parts, a
    /// leading zero in a numeric part, or an empty / invalid pre-release identifier.
    public init?(_ string: String) {
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        let version = trimmed.split(separator: "+", maxSplits: 1, omittingEmptySubsequences: false)[0]
        let parts = version.split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false)
        let core = parts[0].split(separator: ".", omittingEmptySubsequences: false)
        guard (1...3).contains(core.count) else { return nil }
        var numbers: [Int] = []
        for part in core {
            guard let number = Self.number(part) else { return nil }
            numbers.append(number)
        }
        while numbers.count < 3 { numbers.append(0) }

        var prerelease: [String] = []
        if parts.count == 2 {
            let identifiers = parts[1].split(separator: ".", omittingEmptySubsequences: false)
            for identifier in identifiers {
                guard !identifier.isEmpty,
                      identifier.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-") })
                else { return nil }
                // Numeric identifiers must not have leading zeros (semver.org §9).
                if identifier.allSatisfy(\.isNumber), Self.number(identifier) == nil { return nil }
                prerelease.append(String(identifier))
            }
        }
        self.init(major: numbers[0], minor: numbers[1], patch: numbers[2], prerelease: prerelease)
    }

    public var isPrerelease: Bool { !prerelease.isEmpty }

    public var description: String {
        let core = "\(major).\(minor).\(patch)"
        return prerelease.isEmpty ? core : "\(core)-\(prerelease.joined(separator: "."))"
    }

    public static func < (lhs: AppVersion, rhs: AppVersion) -> Bool {
        if lhs.major != rhs.major { return lhs.major < rhs.major }
        if lhs.minor != rhs.minor { return lhs.minor < rhs.minor }
        if lhs.patch != rhs.patch { return lhs.patch < rhs.patch }
        // A pre-release sorts before its release (1.0.0-beta < 1.0.0).
        switch (lhs.prerelease.isEmpty, rhs.prerelease.isEmpty) {
        case (true, true), (true, false): return false
        case (false, true): return true
        case (false, false): break
        }
        for (left, right) in zip(lhs.prerelease, rhs.prerelease) where left != right {
            switch (Self.number(Substring(left)), Self.number(Substring(right))) {
            // Numeric identifiers compare numerically and sort before alphanumeric ones.
            case let (l?, r?): return l < r
            case (_?, nil): return true
            case (nil, _?): return false
            case (nil, nil): return left < right // ASCII order
            }
        }
        // All shared identifiers equal: the shorter set sorts first (1.0.0-alpha < 1.0.0-alpha.1).
        return lhs.prerelease.count < rhs.prerelease.count
    }

    /// A non-negative decimal without a leading zero ("0" itself is fine).
    private static func number(_ text: Substring) -> Int? {
        guard !text.isEmpty, text.allSatisfy({ $0.isASCII && $0.isNumber }) else { return nil }
        guard text == "0" || text.first != "0" else { return nil }
        return Int(text)
    }
}
