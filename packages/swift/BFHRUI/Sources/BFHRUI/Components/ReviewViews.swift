import BFHRCore
import BFHRDesignTokens
import SwiftUI

extension MailCategory {
    /// Icon-only class badge on the company monogram (components.md `ClassificationBadge`).
    /// Neutral palette, never red.
    public var glyph: String {
        switch self {
        case .applicationReceived: "tray.and.arrow.down"
        case .rejection: "envelope.open"
        case .interviewInvite: "calendar"
        case .assessment: "checklist"
        case .offer: "doc.text"
        case .recruiterOutreach: "person.crop.circle"
        case .infoRequest: "questionmark.bubble"
        case .jobAlert: "bell"
        case .otherJob: "envelope"
        case .notJob: "tray"
        }
    }
}

/// "Move **Acme · Frontend Engineer** from Applied to **Interviewing**" (components.md
/// `ProposalSentence`): the application and the target are bold; the sentence wraps and the
/// application name never truncates before the status. Without a status change it names the
/// classification ("Looks like an interview invite").
public struct ProposalSentence: View {
    private let proposal: ReviewProposal

    public init(_ proposal: ReviewProposal) {
        self.proposal = proposal
    }

    public var body: some View {
        Group {
            if let target = proposal.proposedStatus, let from = proposal.currentStatus, target != from,
               let company = proposal.company {
                Text(bfhrPlain: Strings.proposalMove(
                    application: Self.applicationName(company: company, role: proposal.role),
                    from: from,
                    to: target
                ))
            } else {
                Text(Strings.classification(proposal.category, hedged: proposal.isHedged))
            }
        }
        .font(.bfhr(.headline))
        .foregroundStyle(BFHRColor.Fg.primary)
        .fixedSize(horizontal: false, vertical: true)
    }

    static func applicationName(company: CompanyIdentity, role: String?) -> String {
        [company.name, role].compactMap { $0 }.joined(separator: " · ")
    }
}

/// Why the email was linked, as one secondary sentence (components.md `ReasonLine`).
public struct ReasonLine: View {
    private let reason: ReviewReason
    @Environment(\.locale) private var locale

    public init(_ reason: ReviewReason) {
        self.reason = reason
    }

    public var body: some View {
        Text(bfhrPlain: text)
            .font(.bfhr(.subheadline))
            .foregroundStyle(BFHRColor.Fg.secondary)
    }

    private var text: LocalizedStringResource {
        switch reason {
        case .sameThread(let appliedAt):
            appliedAt.map {
                Strings.reasonSameThread(date: $0.formatted(Date.FormatStyle(locale: locale).day().month(.abbreviated)))
            } ?? Strings.reasonSameThreadNoDate
        case .atsSender(let domain): Strings.reasonATS(domain: domain)
        case .companyDomain(let domain): Strings.reasonCompanyDomain(domain: domain)
        case .aiMatch: Strings.reasonAI
        case .noLink: Strings.reasonNoLink
        }
    }
}

/// The review sheet body shared by Today and Mail review (components.md `ReviewSheet`): proposal +
/// reason, the evidence and the three fields scroll; Confirm (primary) / Change… (secondary) are
/// pinned to the bottom, so they're visible at the medium detent too, with the separate "Not job
/// mail" in the scrolling content. Present it in `.sheet` with
/// `.presentationDetents([.medium, .large])`; the correction pickers behind Change… belong to the
/// presenting screen.
public struct ReviewSheet: View {
    private let proposal: ReviewProposal
    private let isOffline: Bool
    private let onConfirm: () -> Void
    private let onChange: () -> Void
    private let onNotJobMail: () -> Void
    @State private var showsFullEmail = false
    @State private var confirmCount = 0

    public init(
        _ proposal: ReviewProposal,
        isOffline: Bool = false,
        onConfirm: @escaping () -> Void,
        onChange: @escaping () -> Void,
        onNotJobMail: @escaping () -> Void
    ) {
        self.proposal = proposal
        self.isOffline = isOffline
        self.onConfirm = onConfirm
        self.onChange = onChange
        self.onNotJobMail = onNotJobMail
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: BFHRSpace.s6) {
                VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                    ProposalSentence(proposal)
                    ReasonLine(proposal.reason)
                    if proposal.isHedged { ConfidenceTag() }
                }
                evidence
                fields
                Button(action: onNotJobMail) { Text(Strings.notJobMail) }
                    .buttonStyle(.bfhrPlain)
                    .frame(maxWidth: .infinity)
            }
            .padding(BFHRSpace.s4)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { actions }
        .bfhrHaptic(.confirm, trigger: confirmCount)
    }

    private var actions: some View {
        VStack(spacing: BFHRSpace.s2) {
            ButtonPair {
                Button {
                    confirmCount += 1
                    onConfirm()
                } label: { Text(Strings.confirm) }
                .disabled(!proposal.canConfirm)
            } secondary: {
                Button(action: onChange) { Text(Strings.change) }
            }
            if isOffline {
                Text(Strings.willSync)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
        }
        .padding(.horizontal, BFHRSpace.s4)
        .padding(.vertical, BFHRSpace.s3)
        .background(.bar)
    }

    private var evidence: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s2) {
            HStack(alignment: .firstTextBaseline) {
                Text(verbatim: proposal.sender.name ?? proposal.sender.address)
                    .font(.bfhr(.subheadline, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.primary)
                Spacer()
                RelativeTimeText(proposal.receivedAt, style: .dayAndTime)
                    .font(.bfhr(.caption1))
                    .foregroundStyle(BFHRColor.Fg.tertiary)
            }
            Text(verbatim: proposal.sender.address + (proposal.accountAddress.map { " → \($0)" } ?? ""))
                .font(.bfhr(.footnote))
                .foregroundStyle(BFHRColor.Fg.secondary)
            Text(verbatim: proposal.subject)
                .font(.bfhr(.subheadline, emphasized: true))
                .foregroundStyle(BFHRColor.Fg.primary)
            Text(verbatim: proposal.snippet)
                .font(.bfhr(.subheadline))
                .foregroundStyle(BFHRColor.Fg.secondary)
                .lineLimit(showsFullEmail ? nil : 3)
            Button { showsFullEmail.toggle() } label: {
                Text(showsFullEmail ? Strings.showLess : Strings.showFullEmail)
            }
            .buttonStyle(.bfhrPlain)
            .padding(.leading, -BFHRSpace.s2)
        }
        .padding(BFHRSpace.s3)
        .background(BFHRColor.Surface.sunken, in: BFHRRadius.shape(BFHRRadius.lg))
    }

    private var fields: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s3) {
            field(Strings.fieldCategory) {
                Label { Text(Strings.classification(proposal.category, hedged: false)) } icon: { Image(systemName: proposal.category.glyph) }
            }
            field(Strings.fieldApplication) {
                if let company = proposal.company, proposal.applicationId != nil {
                    Text(verbatim: ProposalSentence.applicationName(company: company, role: proposal.role))
                } else {
                    Text(Strings.noApplicationFound).foregroundStyle(BFHRTone.warning.text)
                }
            }
            field(Strings.fieldStatusChange) {
                if let target = proposal.proposedStatus {
                    HStack(spacing: BFHRSpace.s2) {
                        if let from = proposal.currentStatus, from != target {
                            StatusPill(from, size: .small)
                            Image(systemName: "arrow.right").accessibilityHidden(true)
                        }
                        StatusPill(target, size: .small)
                    }
                } else {
                    Text(Strings.noStatusChange).foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
        }
    }

    private func field(_ title: LocalizedStringResource, @ViewBuilder value: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.bfhr(.footnote))
                .foregroundStyle(BFHRColor.Fg.secondary)
            value()
                .font(.bfhr(.body))
                .foregroundStyle(BFHRColor.Fg.primary)
        }
        .accessibilityElement(children: .combine)
    }
}

/// The Move to… list (components.md `StatusMenu`): every status, the current one checked, invalid
/// targets disabled with the reason, never hidden (D16). A reason shared by several rows of a
/// section shows once as the section footer; a reason only one row has shows under that row.
/// VoiceOver hears the reason on every disabled row either way. Present it in a sheet with the
/// medium detent; it sets an opaque grouped presentation background, so the list underneath
/// doesn't show through the iOS 26 glass sheet. VoiceOver users reach it through the row's
/// "Move to…" action.
public struct StatusMenu: View {
    private let targets: [MoveTarget]
    private let onSelect: (ApplicationStatus) -> Void

    public init(_ targets: [MoveTarget], onSelect: @escaping (ApplicationStatus) -> Void) {
        self.targets = targets
        self.onSelect = onSelect
    }

    public var body: some View {
        List {
            ForEach(StatusPhase.allCases, id: \.self) { phase in
                let rows = targets.filter { $0.status.phase == phase }
                if !rows.isEmpty {
                    let shared = Self.sharedDenials(in: rows)
                    Section {
                        ForEach(rows) { target in
                            row(target, showsReason: !shared.contains { $0 == Self.denial(of: target) })
                        }
                    } header: {
                        StatusHeader(phase: phase, count: nil)
                    } footer: {
                        if !shared.isEmpty {
                            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                                ForEach(shared, id: \.self) { denial in
                                    if let reason = denial.reason {
                                        Text(reason)
                                    }
                                }
                            }
                            .font(.bfhr(.footnote))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                        }
                    }
                }
            }
        }
        .presentationBackground(BFHRColor.groupedBackground)
    }

    /// The denial with user-facing copy that keeps `target` disabled, if any.
    static func denial(of target: MoveTarget) -> TransitionDenial? {
        guard !target.isCurrent, case .denied(let denial) = target.check, denial.reason != nil else { return nil }
        return denial
    }

    /// Denials carried by two or more rows of one section, in row order: shown once as the footer.
    static func sharedDenials(in rows: [MoveTarget]) -> [TransitionDenial] {
        let denials = rows.compactMap(denial(of:))
        var shared: [TransitionDenial] = []
        for denial in denials where !shared.contains(denial) && denials.filter({ $0 == denial }).count > 1 {
            shared.append(denial)
        }
        return shared
    }

    private func row(_ target: MoveTarget, showsReason: Bool) -> some View {
        Button { onSelect(target.status) } label: {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: BFHRSpace.s2) {
                        ToneDot(tone: target.status.tone)
                        Text(target.status.label)
                            .font(.bfhr(.body))
                            .foregroundStyle(target.isEnabled || target.isCurrent ? BFHRColor.Fg.primary : BFHRColor.Fg.disabled)
                    }
                    if showsReason, let reason = Self.denial(of: target)?.reason {
                        Text(reason)
                            .font(.bfhr(.footnote))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                    }
                }
                Spacer()
                if target.isCurrent {
                    Image(systemName: "checkmark")
                        .foregroundStyle(BFHRColor.Accent.text)
                        .accessibilityHidden(true)
                }
            }
            .frame(minHeight: BFHRHitTarget.minimum)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!target.isEnabled)
        .accessibilityAddTraits(target.isCurrent ? .isSelected : [])
        .accessibilityHint(Self.denial(of: target)?.reason.map { Text($0) } ?? Text(verbatim: ""))
    }
}
