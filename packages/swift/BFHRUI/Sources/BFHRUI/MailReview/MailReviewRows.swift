import BFHRCore
import BFHRDesignTokens
import SwiftUI

// Rows of the Mail tab (mail-review.md "Decision — iOS"): the review row (proposal + reason +
// evidence), the plain job-mail row, the job-alert bundle and the skeleton row.

/// A To review row: who sent what (evidence), what we'd do (proposal) and why (reason), plus the
/// dates we found. Tapping opens the review sheet; Confirm lives on the leading swipe.
struct ReviewQueueRow: View {
    let proposal: ReviewProposal
    /// The inbox it arrived in, when more than one account is connected.
    let accountAddress: String?
    let isPendingSync: Bool

    var body: some View {
        MailRowLayout {
            CompanyMonogram(proposal.company ?? CompanyIdentity(name: senderName), badge: proposal.category.glyph)
        } content: {
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                SenderLine(sender: Text(verbatim: senderName), receivedAt: proposal.receivedAt, isPendingSync: isPendingSync)
                SubjectText(subject: proposal.subject)
                ProposalLine(proposal: proposal)
                    .padding(.top, BFHRSpace.s1)
                ReasonLine(proposal.reason)
                if !proposal.dates.isEmpty || accountAddress != nil {
                    MetaChips(dates: proposal.dates, accountAddress: accountAddress)
                        .padding(.top, BFHRSpace.s1)
                }
            }
        }
        .padding(.vertical, BFHRSpace.s1)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private var senderName: String { proposal.sender.name ?? proposal.sender.address }
}

/// What Confirm will do, in one line: the move ("Move Nordlicht · Frontend Engineer from
/// Acknowledged to Screening") or, without a move, the hedged classification. An amber "Needs a
/// look" when the application or status is missing.
private struct ProposalLine: View {
    let proposal: ReviewProposal

    var body: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s1) {
            HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s2) {
                Image(systemName: proposal.canConfirm ? "arrow.turn.down.right" : "questionmark.circle")
                    .font(.bfhr(.footnote))
                    .foregroundStyle(proposal.canConfirm ? BFHRColor.Accent.text : BFHRTone.warning.text)
                    .accessibilityHidden(true)
                Group {
                    if let target = proposal.proposedStatus, let from = proposal.currentStatus, target != from,
                       let company = proposal.company {
                        Text(Strings.proposalMove(
                            application: [company.name, proposal.role].compactMap { $0 }.joined(separator: " · "),
                            from: from,
                            to: target
                        ))
                    } else {
                        Text(Strings.classification(proposal.category, hedged: proposal.isHedged))
                    }
                }
                .font(.bfhr(.subheadline, emphasized: true))
                .foregroundStyle(BFHRColor.Fg.primary)
                .fixedSize(horizontal: false, vertical: true)
            }
            if !proposal.canConfirm {
                ConfidenceTag(reason: proposal.applicationId == nil ? Strings.noApplicationFound : nil)
            }
        }
    }
}

/// Extracted dates (Gmail "Expected by…" chips) and the receiving inbox.
private struct MetaChips: View {
    let dates: [ExtractedDate]
    let accountAddress: String?

    var body: some View {
        ChipFlow(spacing: BFHRSpace.s1) {
            ForEach(Array(dates.prefix(2).enumerated()), id: \.offset) { _, date in
                MetaChip(systemImage: "calendar") {
                    RelativeTimeText(date.at, style: .dayAndTime)
                }
            }
            if let accountAddress {
                MetaChip(systemImage: "tray") {
                    Text(bfhrPlain: MailViewStrings.receivedIn(accountAddress))
                }
            }
        }
    }
}

private struct MetaChip<Label: View>: View {
    let systemImage: String
    @ViewBuilder let label: Label

    var body: some View {
        HStack(spacing: BFHRSpace.s1) {
            Image(systemName: systemImage).accessibilityHidden(true)
            label
        }
        .font(.bfhr(.caption1))
        .foregroundStyle(BFHRColor.Fg.secondary)
        .padding(.horizontal, BFHRSpace.s2)
        .padding(.vertical, 2)
        .background(BFHRColor.Surface.sunken, in: Capsule())
    }
}

/// A row of All job mail: sender, subject, what it is and where it's filed.
struct JobMailRow: View {
    let row: MailRow

    var body: some View {
        MailRowLayout {
            CompanyMonogram(row.company ?? CompanyIdentity(name: senderName), badge: row.category.glyph)
        } content: {
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                SenderLine(sender: Text(verbatim: senderName), receivedAt: row.receivedAt, isPendingSync: row.isPendingSync)
                SubjectText(subject: row.subject)
                FiledLine(category: row.category, filed: filed)
                if let state = MailViewStrings.reviewState(row.reviewState) {
                    Text(state)
                        .font(.bfhr(.caption1))
                        .foregroundStyle(row.reviewState == .pending ? BFHRTone.warning.text : BFHRColor.Fg.tertiary)
                }
            }
        }
        .padding(.vertical, BFHRSpace.s1)
        .accessibilityElement(children: .combine)
    }

    private var senderName: String { row.sender.name ?? row.sender.address }

    private var filed: String? {
        guard let company = row.company else { return nil }
        return [company.name, row.role].compactMap { $0 }.joined(separator: " · ")
    }
}

/// `job_alert` emails collapsed into one row (Spark bundles): the senders and where the postings go.
struct JobAlertBundleRow: View {
    let bundle: JobAlertBundle

    var body: some View {
        MailRowLayout {
            CompanyMonogram(CompanyIdentity(name: bundle.senders.first?.name ?? bundle.senders.first?.address ?? "?"), badge: MailCategory.jobAlert.glyph)
        } content: {
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                SenderLine(sender: Text(MailViewStrings.jobAlerts(bundle.count)), receivedAt: bundle.latestReceivedAt, isPendingSync: false)
                Text(verbatim: bundle.senders.map { $0.name ?? $0.address }.joined(separator: ", "))
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .lineLimit(2)
                Text(MailViewStrings.jobAlertsDetail)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
        }
        .padding(.vertical, BFHRSpace.s1)
        .accessibilityElement(children: .combine)
    }
}

/// Monogram beside the text; above it at accessibility sizes, so the text gets the full width.
private struct MailRowLayout<Leading: View, Content: View>: View {
    @ViewBuilder let leading: Leading
    @ViewBuilder let content: Content
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                leading
                content
            }
        } else {
            HStack(alignment: .top, spacing: BFHRSpace.s3) {
                leading
                content
            }
        }
    }
}

/// Sender (one line) with the time on the trailing edge; at accessibility sizes the sender wraps
/// in full and the time sits under it.
private struct SenderLine: View {
    let sender: Text
    let receivedAt: Date
    let isPendingSync: Bool
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 2) {
                name
                HStack(spacing: BFHRSpace.s2) {
                    MailTimeText(date: receivedAt)
                    if isPendingSync { SyncGlyph() }
                }
            }
        } else {
            HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s2) {
                name.lineLimit(1)
                Spacer(minLength: BFHRSpace.s1)
                if isPendingSync { SyncGlyph() }
                MailTimeText(date: receivedAt)
            }
        }
    }

    private var name: some View {
        sender
            .font(.bfhr(.subheadline, emphasized: true))
            .foregroundStyle(BFHRColor.Fg.primary)
    }
}

/// The subject: two lines in the list (the sheet has it in full); unlimited at accessibility sizes.
private struct SubjectText: View {
    let subject: String
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Text(verbatim: subject)
            .font(.bfhr(.subheadline))
            .foregroundStyle(BFHRColor.Fg.secondary)
            .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)
    }
}

/// "Interview invite  Nordlicht Mobility · Frontend Engineer": what it is and where it's filed.
private struct FiledLine: View {
    let category: MailCategory
    let filed: String?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: BFHRSpace.s2))
        layout {
            Text(Strings.classification(category, hedged: false))
                .font(.bfhr(.footnote, emphasized: true))
                .foregroundStyle(BFHRColor.Fg.primary)
            if let filed {
                Text(verbatim: filed)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
            }
        }
    }
}

/// The review row's layout with placeholder text, redacted by `PhaseContainer`.
struct MailSkeletonRow: View {
    var body: some View {
        HStack(alignment: .top, spacing: BFHRSpace.s3) {
            CompanyMonogram(CompanyIdentity(name: "Sender"))
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                HStack {
                    Text(verbatim: "Sender name").font(.bfhr(.subheadline, emphasized: true))
                    Spacer()
                    Text(verbatim: "Mon").font(.bfhr(.caption1))
                }
                Text(verbatim: "Subject line of the email").font(.bfhr(.subheadline))
                Text(verbatim: "Looks like an interview invite").font(.bfhr(.subheadline, emphasized: true))
                Text(verbatim: "Same email thread as your application").font(.bfhr(.footnote))
            }
        }
        .padding(.vertical, BFHRSpace.s1)
    }
}

// iOS-only list / picker API the Mail tab uses (BFHRUI also compiles for macOS for `swift test`).
extension View {
    /// `.listSectionSpacing(.compact)` on iOS.
    func mailCompactSectionSpacing() -> some View {
        #if os(iOS)
        listSectionSpacing(.compact)
        #else
        self
        #endif
    }

    /// `.pickerStyle(.navigationLink)` on iOS: the choice list opens as a pushed page.
    func mailNavigationLinkPicker() -> some View {
        #if os(iOS)
        pickerStyle(.navigationLink)
        #else
        pickerStyle(.menu)
        #endif
    }
}


/// Today's emails show the time, older ones the day.
struct MailTimeText: View {
    let date: Date
    @Environment(\.bfhrNow) private var now
    @Environment(\.calendar) private var calendar

    var body: some View {
        RelativeTimeText(date, style: calendar.isDate(date, inSameDayAs: now) ? .time : .day)
            .font(.bfhr(.caption1))
            .foregroundStyle(BFHRColor.Fg.tertiary)
    }
}
