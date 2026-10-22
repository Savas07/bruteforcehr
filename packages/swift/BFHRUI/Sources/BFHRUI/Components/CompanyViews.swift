import BFHRDesignTokens
import SwiftUI

/// Company initial in a circle (components.md `CompanyChip` / `Monogram`). Logos arrive with the
/// job-source work; until then every company gets a monogram. Decorative: rows name the company
/// in text. An optional badge (SF Symbol) sits on the bottom-trailing edge, e.g. the mail
/// `ClassificationBadge`.
///
/// In a row next to text, pass `hidesAtAccessibilitySizes: true`: at accessibility text sizes the
/// scaled circle would squeeze the text column to a word per line, and the row already names the
/// company. The shared rows do this.
public struct CompanyMonogram: View {
    private let company: CompanyIdentity
    private let badge: String?
    private let hidesAtAccessibilitySizes: Bool
    @ScaledMetric(relativeTo: .body) private var diameter: CGFloat = 36
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    public init(_ company: CompanyIdentity, badge: String? = nil, hidesAtAccessibilitySizes: Bool = false) {
        self.company = company
        self.badge = badge
        self.hidesAtAccessibilitySizes = hidesAtAccessibilitySizes
    }

    /// First letter of the first word that starts with a letter, uppercased for the locale.
    static func initial(of name: String, locale: Locale = .current) -> String {
        let word = name.split(separator: " ").first { $0.first?.isLetter == true } ?? Substring(name)
        return word.first.map { String($0).uppercased(with: locale) } ?? "?"
    }

    public var body: some View {
        if !(hidesAtAccessibilitySizes && dynamicTypeSize.isAccessibilitySize) {
            circle
        }
    }

    private var circle: some View {
        Circle()
            .fill(BFHRColor.Surface.sunken)
            .overlay(Circle().strokeBorder(BFHRColor.Line.subtle, lineWidth: BFHRBorderWidth.hairline))
            .overlay {
                Text(Self.initial(of: company.name))
                    .font(.bfhr(.headline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
            .frame(width: diameter, height: diameter)
            .overlay(alignment: .bottomTrailing) {
                if let badge {
                    Image(systemName: badge)
                        .font(.bfhr(.caption2, emphasized: true))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .padding(3)
                        .background(BFHRColor.Surface.base, in: Circle())
                        .overlay(Circle().strokeBorder(BFHRColor.Line.subtle, lineWidth: BFHRBorderWidth.hairline))
                        .offset(x: 4, y: 4)
                }
            }
            .accessibilityHidden(true)
    }
}

/// Monogram + company name on one line.
public struct CompanyChip: View {
    private let company: CompanyIdentity

    public init(_ company: CompanyIdentity) {
        self.company = company
    }

    public var body: some View {
        HStack(spacing: BFHRSpace.s2) {
            CompanyMonogram(company, hidesAtAccessibilitySizes: true)
            Text(company.name)
                .font(.bfhr(.subheadline, emphasized: true))
                .foregroundStyle(BFHRColor.Fg.primary)
        }
        .accessibilityElement(children: .combine)
    }
}
