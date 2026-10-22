import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// The Mail tab (mail-review.md "Decision — iOS"): a title menu for the account scope, a calm sync
/// line, the To review · Updates · All job mail · Category chips, a non-dismissible Reconnect card
/// per broken account, and the active list. Review rows open the review sheet; Confirm is the
/// leading swipe, Change… / Not job mail the trailing one, and the context menu adds Review later.
/// Nothing is confirmed in bulk.
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
                    primary: .init(MailViewStrings.connectAction) { openURL(.connectEmail) }
                )
            }
        } skeleton: {
            List {
                Section {
                    ForEach(0..<5, id: \.self) { _ in MailSkeletonRow() }
                }
            }
            .bfhrInsetGroupedList()
        } failure: { failure in
            PaneError(failure, title: MailViewStrings.errorTitle, retry: { openURL(.mail) })
        }
        .toolbar {
            if model.filter == .updates && !model.updates.isEmpty {
                ToolbarItem(placement: .bfhrTrailing) {
                    Menu {
                        Button { model.markAllUpdatesSeen() } label: {
                            Label { Text(MailViewStrings.markAllSeen) } icon: { Image(systemName: "checkmark.circle") }
                        }
                    } label: {
                        Label { Text(MailViewStrings.more) } icon: { Image(systemName: "ellipsis") }
                    }
                }
            }
        }
        .toolbarTitleMenu {
            if model.accounts.count > 1 {
                Picker(selection: $model.accountFilter) {
                    Text(MailViewStrings.allAccounts).tag(String?.none)
                    ForEach(model.accounts) { account in
                        Group {
                            if account.needsAttention {
                                Label { Text(MailViewStrings.needsSignIn(account.address)) } icon: { Image(systemName: "exclamationmark.triangle") }
                            } else {
                                Text(verbatim: account.address)
                            }
                        }
                        .tag(Optional(account.id))
                    }
                } label: {
                    Text(MailViewStrings.scopeMenu)
                }
            }
        }
        .bfhrToastHost()
        .bfhrTabBadge(model.badgeCount)
        .environment(\.bfhrNow, model.now)
        .sheet(item: $model.draft) { _ in
            MailReviewSheet(
                model: model,
                onConfirm: { run { try model.confirmDraft() } },
                onNotJobMail: {
                    guard let id = model.draft?.messageId else { return }
                    run { try model.markNotJobMail(id) }
                }
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }

    @Environment(\.openURL) private var openURLAction
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private func openURL(_ link: MailLink) {
        openURLAction(link.url)
    }

    // MARK: List

    private var list: some View {
        List {
            ConnectionBannerSection(model.connection)
            header
            ForEach(model.needsAttention) { account in
                Section {
                    InlineAlert(
                        .warning,
                        title: MailViewStrings.reconnect(account.address),
                        message: MailViewStrings.reconnectBody,
                        actionTitle: MailViewStrings.reconnectAction,
                        action: { openURL(.mailAccount(account.id)) }
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
            }
            switch model.filter {
            case .toReview: toReviewSection
            case .updates: updatesSection
            case .allJobMail: allJobMailSection
            }
        }
        .bfhrInsetGroupedList()
        .animation(BFHRMotion.animation(.base, reduceMotion: reduceMotion), value: model.toReview.map(\.id))
    }

    /// Sync line + chips, on the grouped background under the large title.
    private var header: some View {
        Section {
            VStack(alignment: .leading, spacing: BFHRSpace.s3) {
                syncLine
                ChipFlow {
                    chip(.toReview, title: MailViewStrings.chipToReview(model.counts.toReview))
                    chip(.updates, title: MailViewStrings.chipUpdates)
                    chip(.allJobMail(), title: MailViewStrings.chipAll)
                    if model.filter.chip == .allJobMail {
                        CategoryChip(model: model)
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel(Text(MailViewStrings.chipFilters))
            }
            .listRowInsets(EdgeInsets(top: 0, leading: BFHRSpace.s1, bottom: BFHRSpace.s2, trailing: BFHRSpace.s1))
            .listRowBackground(Color.clear)
        }
        .mailCompactSectionSpacing()
    }

    @ViewBuilder private var syncLine: some View {
        VStack(alignment: .leading, spacing: 2) {
            if model.connection.isOffline, let checked = model.lastChecked {
                StaleStamp(checked, kind: .lastChecked)
                Text(MailViewStrings.offlineFootnote)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.tertiary)
            } else {
                SyncLine(scope: scopeName, lastChecked: model.lastChecked, now: model.now)
            }
        }
    }

    private var scopeName: String? {
        guard model.accounts.count > 1 else { return nil }
        return model.accounts.first { $0.id == model.accountFilter }?.address
    }

    private func chip(_ filter: MailFilter, title: LocalizedStringResource) -> some View {
        Toggle(isOn: Binding(get: { model.filter.chip == filter.chip }, set: { if $0 { model.filter = filter } })) {
            Text(title)
        }
        .toggleStyle(.bfhrChip)
    }

    // MARK: To review

    @ViewBuilder private var toReviewSection: some View {
        if model.toReview.isEmpty {
            Section {
                EmptyState(
                    .caughtUp,
                    glyph: "checkmark.circle",
                    title: MailViewStrings.queueEmptyTitle,
                    message: MailViewStrings.queueEmptyBody,
                    primary: model.counts.updates > 0 ? .init(MailViewStrings.seeRecentUpdates) { model.filter = .updates } : nil
                )
            }
        } else {
            Section {
                ForEach(model.toReview) { proposal in
                    Button { model.beginReview(proposal.id) } label: {
                        ReviewQueueRow(
                            proposal: proposal,
                            accountAddress: model.showsAccountDot && model.accountFilter == nil ? proposal.accountAddress : nil,
                            isPendingSync: model.pendingSyncIDs.contains(proposal.id)
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint(Text(MailViewStrings.review))
                    .bfhrRowActions(actions(for: proposal))
                }
            } header: {
                Text(MailViewStrings.queueHeader)
            } footer: {
                Text(MailViewStrings.queueFooter)
            }
        }
    }

    private func actions(for proposal: ReviewProposal) -> [RowAction] {
        [
            RowAction(Strings.confirm, systemImage: "checkmark", edge: .leading, haptic: .confirm, isEnabled: proposal.canConfirm) {
                run { try model.confirm(proposal.id) }
            },
            RowAction(Strings.change, systemImage: "pencil", edge: .trailing, tint: BFHRColor.Accent.text) {
                model.beginReview(proposal.id)
            },
            RowAction(Strings.notJobMail, systemImage: "tray", edge: .trailing) {
                run { try model.markNotJobMail(proposal.id) }
            },
            RowAction(MailViewStrings.reviewLater, systemImage: "clock", edge: .menuOnly) {
                model.reviewLater(proposal.id)
            },
        ]
    }

    // MARK: Updates

    @ViewBuilder private var updatesSection: some View {
        Section {
            if model.updates.isEmpty {
                EmptyState(.subArea, title: MailViewStrings.updatesEmpty)
            }
            ForEach(model.updates) { item in
                AutoChangeRow(item) { run { try model.undoUpdate(item.id) } }
                    .contextMenu {
                        if item.canUndo {
                            Button { run { try model.undoUpdate(item.id) } } label: {
                                Label { Text(Strings.undo) } icon: { Image(systemName: "arrow.uturn.backward") }
                            }
                        }
                    }
            }
        } header: {
            Text(MailViewStrings.updatesHeader)
        } footer: {
            Text(MailViewStrings.updatesFooter)
        }
    }

    // MARK: All job mail

    @ViewBuilder private var allJobMailSection: some View {
        Section {
            let items = model.allJobMail
            if items.isEmpty {
                if case .allJobMail(let category?) = model.filter, category != .notJob {
                    EmptyState(
                        .noResults,
                        title: MailViewStrings.categoryEmpty,
                        primary: .init(MailViewStrings.showAllCategories) { model.filter = .allJobMail() }
                    )
                } else {
                    EmptyState(.subArea, title: MailViewStrings.allEmpty)
                }
            }
            ForEach(items) { item in
                switch item {
                case .message(let row):
                    JobMailRow(row: row)
                        .bfhrRowActions(row.reviewState == .pending ? [
                            RowAction(MailViewStrings.review, systemImage: "checklist", edge: .menuOnly) { model.beginReview(row.id) },
                            RowAction(Strings.notJobMail, systemImage: "tray", edge: .trailing) { run { try model.markNotJobMail(row.id) } },
                        ] : [
                            RowAction(Strings.notJobMail, systemImage: "tray", edge: .trailing) { run { try model.markNotJobMail(row.id) } },
                        ])
                case .jobAlerts(let bundle):
                    JobAlertBundleRow(bundle: bundle)
                }
            }
        }
    }

    // MARK: Helpers

    private func run(_ action: () throws -> ToastItem) {
        do {
            toasts?.show(try action())
        } catch {
            toasts?.show(ToastItem(glyph: ToastGlyph.info, message: MailViewStrings.actionFailed))
        }
    }
}

/// "All accounts · Checked 6 min. ago": the account scope and how fresh the list is.
private struct SyncLine: View {
    let scope: String?
    let lastChecked: Date?
    let now: Date
    @Environment(\.locale) private var locale

    var body: some View {
        let sync = sync
        Group {
            if let scope {
                Text(MailViewStrings.scoped(scope, String(localized: sync)))
            } else {
                Text(sync)
            }
        }
        .font(.bfhr(.footnote))
        .foregroundStyle(BFHRColor.Fg.secondary)
    }

    private var sync: LocalizedStringResource {
        guard let lastChecked else { return MailViewStrings.notCheckedYet }
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = locale
        formatter.unitsStyle = .abbreviated
        return MailViewStrings.checked(formatter.localizedString(for: lastChecked, relativeTo: now))
    }
}

/// "Category ▾" (last chip of All job mail): a menu of the categories with their counts.
private struct CategoryChip: View {
    @Bindable var model: MailReviewModel

    var body: some View {
        Menu {
            Picker(selection: selection) {
                Text(MailViewStrings.allCategories).tag(MailCategory?.none)
                ForEach(model.categoryOptions.filter { (model.categoryCounts[$0] ?? 0) > 0 }, id: \.self) { category in
                    Label {
                        Text(MailViewStrings.categoryName(category))
                        Text(verbatim: "\(model.categoryCounts[category] ?? 0)")
                    } icon: {
                        Image(systemName: category.glyph)
                    }
                    .tag(Optional(category))
                }
            } label: {
                Text(MailViewStrings.chipCategory)
            }
            .pickerStyle(.inline)
        } label: {
            HStack(spacing: BFHRSpace.s1) {
                if let selected {
                    Text(MailViewStrings.categoryName(selected))
                } else {
                    Text(MailViewStrings.chipCategory)
                }
                Image(systemName: "chevron.down")
                    .font(.bfhr(.caption1, emphasized: true))
                    .accessibilityHidden(true)
            }
            .font(.bfhr(.subheadline, emphasized: selected != nil))
            .foregroundStyle(selected != nil ? BFHRColor.Accent.text : BFHRColor.Fg.primary)
            .padding(.horizontal, BFHRSpace.s3)
            .frame(minHeight: BFHRHitTarget.minimum)
            .background(selected != nil ? BFHRColor.Accent.subtle : BFHRColor.Surface.base, in: Capsule())
            .overlay(Capsule().strokeBorder(selected != nil ? BFHRColor.Accent.text : BFHRColor.Line.control, lineWidth: BFHRBorderWidth.thin))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(MailViewStrings.chipCategory))
        .accessibilityValue(Text(selected.map(MailViewStrings.categoryName) ?? MailViewStrings.allCategories))
    }

    private var selected: MailCategory? {
        if case .allJobMail(let category) = model.filter { category } else { nil }
    }

    private var selection: Binding<MailCategory?> {
        Binding(get: { selected }, set: { model.filter = .allJobMail(category: $0) })
    }
}

/// In-app links (IA.md "Deep links") the Mail tab's buttons open; the app's `openURL` handler
/// routes them to their tab or sheet.
private enum MailLink {
    case mail
    case connectEmail
    case mailAccount(String)

    var url: URL {
        switch self {
        case .mail: URL(string: "bruteforcehr://mail")!
        case .connectEmail: URL(string: "bruteforcehr://settings/mail-accounts")!
        case .mailAccount(let id): URL(string: "bruteforcehr://settings/mail-accounts/\(id)")!
        }
    }
}
