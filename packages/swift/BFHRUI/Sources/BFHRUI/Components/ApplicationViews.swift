import BFHRCore
import BFHRDesignTokens
import SwiftUI

extension Channel {
    public var label: LocalizedStringResource {
        switch self {
        case .email: .bfhr("channel.email", default: "Email")
        case .externalLink: .bfhr("channel.externalLink", default: "Company site")
        case .referral: .bfhr("channel.referral", default: "Referral")
        case .recruiter: .bfhr("channel.recruiter", default: "Recruiter")
        case .other: .bfhr("channel.other", default: "Other")
        }
    }
}

/// Status, channel, applied date and the documents used (components.md
/// `ApplicationSummaryBlock`, Job detail and Tracker detail). The status pill opens Move to….
public struct ApplicationSummaryBlock: View {
    public struct Content: Hashable, Sendable {
        public var status: ApplicationStatus
        public var channel: Channel?
        public var appliedAt: Date?
        public var cvTitle: String?
        public var coverLetterTitle: String?
        public var isPendingSync: Bool

        public init(
            status: ApplicationStatus,
            channel: Channel? = nil,
            appliedAt: Date? = nil,
            cvTitle: String? = nil,
            coverLetterTitle: String? = nil,
            isPendingSync: Bool = false
        ) {
            self.status = status
            self.channel = channel
            self.appliedAt = appliedAt
            self.cvTitle = cvTitle
            self.coverLetterTitle = coverLetterTitle
            self.isPendingSync = isPendingSync
        }
    }

    private let content: Content
    private let onStatusTap: (() -> Void)?

    public init(_ content: Content, onStatusTap: (() -> Void)? = nil) {
        self.content = content
        self.onStatusTap = onStatusTap
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s3) {
            StatusPill(content.status, isPendingSync: content.isPendingSync, onTap: onStatusTap)
            if let channel = content.channel {
                row(Strings.fieldChannel) { Text(channel.label) }
            }
            if let appliedAt = content.appliedAt {
                row(Strings.fieldApplied) { RelativeTimeText(appliedAt, style: .day) }
            }
            if let cv = content.cvTitle {
                row(Strings.fieldCV) { Label { Text(verbatim: cv) } icon: { Image(systemName: "doc.text") } }
            }
            if let letter = content.coverLetterTitle {
                row(Strings.fieldCoverLetter) { Label { Text(verbatim: letter) } icon: { Image(systemName: "doc.plaintext") } }
            }
        }
    }

    private func row(_ title: LocalizedStringResource, @ViewBuilder value: () -> some View) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).foregroundStyle(BFHRColor.Fg.secondary)
                Spacer(minLength: BFHRSpace.s4)
                value().foregroundStyle(BFHRColor.Fg.primary)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).foregroundStyle(BFHRColor.Fg.secondary)
                value().foregroundStyle(BFHRColor.Fg.primary)
            }
        }
        .font(.bfhr(.subheadline))
        .accessibilityElement(children: .combine)
    }
}

/// "Did you submit your application to Acme?" (components.md `SubmitPrompt`, Job detail and
/// Tracker): Yes, I applied (primary, `confirm` haptic) · Not yet · I'm not applying.
public struct SubmitPrompt: View {
    private let company: String
    private let onApplied: () -> Void
    private let onNotYet: () -> Void
    private let onNotApplying: () -> Void
    @State private var confirmCount = 0

    public init(company: String, onApplied: @escaping () -> Void, onNotYet: @escaping () -> Void, onNotApplying: @escaping () -> Void) {
        self.company = company
        self.onApplied = onApplied
        self.onNotYet = onNotYet
        self.onNotApplying = onNotApplying
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s3) {
            Text(Strings.submitQuestion(company: company))
                .font(.bfhr(.headline))
                .foregroundStyle(BFHRColor.Fg.primary)
            ButtonPair {
                Button {
                    confirmCount += 1
                    onApplied()
                } label: { Text(Strings.submitYes) }
            } secondary: {
                Button(action: onNotYet) { Text(Strings.submitNotYet) }
            }
            Button(action: onNotApplying) { Text(Strings.submitNotApplying) }
                .buttonStyle(.bfhrPlain)
        }
        .padding(BFHRSpace.s4)
        .background(BFHRColor.Surface.base, in: BFHRRadius.shape(BFHRRadius.lg))
        .overlay(BFHRRadius.shape(BFHRRadius.lg).strokeBorder(BFHRColor.Line.subtle, lineWidth: BFHRBorderWidth.thin))
        .bfhrHaptic(.confirm, trigger: confirmCount)
    }
}
