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
        HStack(alignment: .top, spacing: BFHRSpace.s3) {
            CompanyMonogram(proposal.company ?? CompanyIdentity(name: senderName), badge: proposal.category.glyph)
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s2) {
                    Text(verbatim: senderName)
                        .font(.bfhr(.subheadline, emphasized: true))
                        .foregroundStyle(BFHRColor.Fg.primary)
                        .lineLimit(1)
                    Spacer(minLength: BFHRSpace.s1)
                    if isPendingSync { SyncGlyph() }
                    RelativeTimeText(proposal.receivedAt, style: .day)
                        .font(.bfhr(.caption1))
                        .foregroundStyle(BFHRColor.Fg.tertiary)
                }
                Text(verbatim: proposal.subject)
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .lineLimit(2)
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
                    Text(MailViewStrings.receivedIn(accountAddress))
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
        HStack(alignment: .top, spacing: BFHRSpace.s3) {
            CompanyMonogram(row.company ?? CompanyIdentity(name: senderName), badge: row.category.glyph)
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s2) {
                    Text(verbatim: senderName)
                        .font(.bfhr(.subheadline, emphasized: true))
                        .foregroundStyle(BFHRColor.Fg.primary)
                        .lineLimit(1)
                    Spacer(minLength: BFHRSpace.s1)
                    if row.isPendingSync { SyncGlyph() }
                    RelativeTimeText(row.receivedAt, style: .day)
                        .font(.bfhr(.caption1))
                        .foregroundStyle(BFHRColor.Fg.tertiary)
                }
                Text(verbatim: row.subject)
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .lineLimit(2)
                HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s2) {
                    Text(Strings.classification(row.category, hedged: false))
                        .font(.bfhr(.footnote, emphasized: true))
                        .foregroundStyle(BFHRColor.Fg.primary)
                    if let filed {
                        Text(verbatim: filed)
                            .font(.bfhr(.footnote))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                            .lineLimit(1)
                    }
                }
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
        HStack(alignment: .top, spacing: BFHRSpace.s3) {
            CompanyMonogram(CompanyIdentity(name: bundle.senders.first?.name ?? bundle.senders.first?.address ?? "?"), badge: MailCategory.jobAlert.glyph)
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s2) {
                    Text(MailViewStrings.jobAlertsTitle)
                        .font(.bfhr(.subheadline, emphasized: true))
                        .foregroundStyle(BFHRColor.Fg.primary)
                    Spacer(minLength: BFHRSpace.s1)
                    RelativeTimeText(bundle.latestReceivedAt, style: .day)
                        .font(.bfhr(.caption1))
                        .foregroundStyle(BFHRColor.Fg.tertiary)
                }
                Text(verbatim: bundle.senders.map { $0.name ?? $0.address }.joined(separator: ", "))
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .lineLimit(2)
                Text(MailViewStrings.jobAlerts(bundle.count))
                    .font(.bfhr(.footnote, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.primary)
                Text(MailViewStrings.jobAlertsDetail)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
        }
        .padding(.vertical, BFHRSpace.s1)
        .accessibilityElement(children: .combine)
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
