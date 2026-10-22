import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// Foundation rendering of `MailReviewModel`: account health, filter chips and the active list
/// with the shared review / auto-change components. The screen's real design replaces this file.
public struct MailReviewScreen: View {
    @Bindable private var model: MailReviewModel
    @Environment(ToastCenter.self) private var toasts: ToastCenter?

    public init(model: MailReviewModel) {
        self.model = model
    }

    public var body: some View {
        PhaseContainer(model.phase, loadingLabel: MailViewStrings.loading) {
            if model.hasAccounts {
                list
            } else {
                EmptyState(
                    .firstUse,
                    glyph: "envelope",
                    title: MailViewStrings.connectTitle,
                    message: MailViewStrings.connectBody,
                    primary: .init(MailViewStrings.connectAction) {}
                )
            }
        } skeleton: {
            List {
                ForEach(0..<6, id: \.self) { _ in
                    HStack(spacing: BFHRSpace.s3) {
                        CompanyMonogram(CompanyIdentity(name: "Sender"))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: "Sender name").font(.bfhr(.headline))
                            Text(verbatim: "Subject line of the email").font(.bfhr(.subheadline))
                        }
                    }
                }
            }
            .bfhrInsetGroupedList()
        } failure: { failure in
            PaneError(failure, title: MailViewStrings.errorTitle, retry: {})
        }
        .bfhrToastHost()
        .environment(\.bfhrNow, model.now)
        .sheet(item: $model.draft) { draft in
            if let proposal = model.reviewing {
                ReviewSheet(
                    proposal,
                    isOffline: model.connection.isOffline,
                    onConfirm: {
                        let id = draft.messageId
                        model.endReview()
                        run { try model.confirm(id) }
                    },
                    onChange: {},
                    onNotJobMail: {
                        let id = draft.messageId
                        model.endReview()
                        run { try model.markNotJobMail(id) }
                    }
                )
                .presentationDetents([.medium, .large])
            }
        }
    }

    private var list: some View {
        List {
            ConnectionBannerSection(model.connection)
            ForEach(model.needsAttention) { account in
                InlineAlert(
                    .warning,
                    title: MailViewStrings.reconnect(account.address),
                    message: MailViewStrings.reconnectBody,
                    actionTitle: MailViewStrings.reconnectAction,
                    action: {}
                )
                .listRowInsets(EdgeInsets())
            }
            Section {
                ChipFlow {
                    chip(.toReview, title: MailViewStrings.chipToReview(model.counts.toReview))
                    chip(.updates, title: MailViewStrings.chipUpdates)
                    chip(.allJobMail(), title: MailViewStrings.chipAll)
                }
                if let checked = model.lastChecked {
                    StaleStamp(checked, kind: .lastChecked)
                }
            }
            Section {
                switch model.filter {
                case .toReview:
                    if model.toReview.isEmpty {
                        EmptyState(.caughtUp, title: MailViewStrings.queueEmptyTitle, message: MailViewStrings.queueEmptyBody)
                    }
                    ForEach(model.toReview) { proposal in
                        Button { _ = model.beginReview(proposal.id) } label: {
                            HStack(alignment: .top, spacing: BFHRSpace.s3) {
                                CompanyMonogram(proposal.company ?? CompanyIdentity(name: proposal.sender.name ?? proposal.sender.address), badge: proposal.category.glyph)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(verbatim: proposal.sender.name ?? proposal.sender.address).font(.bfhr(.headline)).foregroundStyle(BFHRColor.Fg.primary)
                                    Text(verbatim: proposal.subject).font(.bfhr(.subheadline)).foregroundStyle(BFHRColor.Fg.primary).lineLimit(1)
                                    Text(Strings.classification(proposal.category, hedged: proposal.isHedged)).font(.bfhr(.footnote)).foregroundStyle(BFHRColor.Fg.secondary)
                                }
                                Spacer(minLength: BFHRSpace.s2)
                                RelativeTimeText(proposal.receivedAt, style: .day).font(.bfhr(.caption1)).foregroundStyle(BFHRColor.Fg.tertiary)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .bfhrRowActions([
                            RowAction(Strings.confirm, systemImage: "checkmark", edge: .leading, haptic: .confirm, isEnabled: proposal.canConfirm) {
                                run { try model.confirm(proposal.id) }
                            },
                            RowAction(Strings.notJobMail, systemImage: "tray", edge: .trailing) {
                                run { try model.markNotJobMail(proposal.id) }
                            },
                        ])
                    }
                case .updates:
                    ForEach(model.updates) { item in
                        AutoChangeRow(item) { run { try model.undoUpdate(item.id) } }
                    }
                case .allJobMail:
                    ForEach(model.allJobMail) { item in
                        switch item {
                        case .message(let row):
                            HStack(spacing: BFHRSpace.s3) {
                                CompanyMonogram(row.company ?? CompanyIdentity(name: row.sender.name ?? row.sender.address), badge: row.category.glyph)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(verbatim: row.sender.name ?? row.sender.address).font(.bfhr(.headline))
                                    Text(verbatim: row.subject).font(.bfhr(.subheadline)).foregroundStyle(BFHRColor.Fg.secondary).lineLimit(1)
                                }
                                Spacer(minLength: 0)
                                if row.isPendingSync { SyncGlyph() }
                            }
                        case .jobAlerts(let bundle):
                            Label { Text(MailViewStrings.jobAlerts(bundle.count)) } icon: { Image(systemName: "bell") }
                                .font(.bfhr(.subheadline))
                                .foregroundStyle(BFHRColor.Fg.secondary)
                        }
                    }
                }
            }
        }
        .bfhrInsetGroupedList()
    }

    private func chip(_ filter: MailFilter, title: LocalizedStringResource) -> some View {
        Toggle(isOn: Binding(get: { model.filter.chip == filter.chip }, set: { if $0 { model.filter = filter } })) {
            Text(title)
        }
        .toggleStyle(.bfhrChip)
    }

    private func run(_ action: () throws -> ToastItem) {
        do {
            toasts?.show(try action())
        } catch {
            toasts?.show(ToastItem(glyph: ToastGlyph.info, message: MailViewStrings.actionFailed))
        }
    }
}

enum MailViewStrings {
    static let loading = LocalizedStringResource.bfhr("mail.loading", default: "Loading job mail", table: "MailReview")
    static let errorTitle = LocalizedStringResource.bfhr("mail.error.title", default: "We couldn't load your job mail", table: "MailReview")
    static let connectTitle = LocalizedStringResource.bfhr("mail.connect.title", default: "Connect your email", table: "MailReview")
    static let connectBody = LocalizedStringResource.bfhr("mail.connect.body", default: "We read job emails, like interview invites and replies, and keep your applications up to date. About 2 minutes.", table: "MailReview")
    static let connectAction = LocalizedStringResource.bfhr("mail.connect.action", default: "Connect email", table: "MailReview")
    static let reconnectBody = LocalizedStringResource.bfhr("mail.reconnect.body", default: "We can't check this inbox until you sign in again.", table: "MailReview")
    static let reconnectAction = LocalizedStringResource.bfhr("mail.reconnect.action", default: "Reconnect", table: "MailReview")
    static let chipUpdates = LocalizedStringResource.bfhr("mail.chip.updates", default: "Updates", table: "MailReview")
    static let chipAll = LocalizedStringResource.bfhr("mail.chip.all", default: "All job mail", table: "MailReview")
    static let queueEmptyTitle = LocalizedStringResource.bfhr("mail.queueEmpty.title", default: "Nothing to review", table: "MailReview")
    static let queueEmptyBody = LocalizedStringResource.bfhr("mail.queueEmpty.body", default: "When we're unsure how to sort an email, it shows up here.", table: "MailReview")
    static let actionFailed = LocalizedStringResource.bfhr("mail.toast.actionFailed", default: "That change didn't go through. Try again.", table: "MailReview")

    static func reconnect(_ address: String) -> LocalizedStringResource {
        .bfhr("mail.reconnect.title", default: "Reconnect \(address)", table: "MailReview")
    }

    static func chipToReview(_ count: Int) -> LocalizedStringResource {
        .bfhr("mail.chip.toReview", default: "To review (\(count))", table: "MailReview")
    }

    static func jobAlerts(_ count: Int) -> LocalizedStringResource {
        .bfhr("mail.jobAlerts", default: "Job alerts · \(count) emails", table: "MailReview")
    }
}
