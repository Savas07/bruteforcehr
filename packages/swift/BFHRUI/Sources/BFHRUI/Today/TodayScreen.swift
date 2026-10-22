import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// Foundation demo of Today: `TodayModel` as a plain inset-grouped list built only from the shared
/// components, to prove the model, the five states and the capture harness. Today's real design
/// replaces this file (docs/design/foundation-ios.md, "Adding a screen").
public struct TodayScreen: View {
    @Bindable private var model: TodayModel
    @Environment(ToastCenter.self) private var toasts: ToastCenter?
    @State private var reviewing: ReviewProposal?
    @State private var saveCount = 0

    public init(model: TodayModel) {
        self.model = model
    }

    public var body: some View {
        PhaseContainer(model.phase, loadingLabel: TodayStrings.loading) {
            content
        } skeleton: {
            skeleton
        } failure: { failure in
            PaneError(failure, title: TodayStrings.errorTitle, retry: {})
        }
        .bfhrToastHost()
        .environment(\.bfhrNow, model.now)
        .bfhrHaptic(.confirm, trigger: saveCount)
        .sheet(item: $reviewing) { proposal in
            ReviewSheet(
                proposal,
                isOffline: model.connection.isOffline,
                onConfirm: { reviewing = nil; run { try model.confirm(proposal.id) } },
                onChange: { reviewing = nil },
                onNotJobMail: { reviewing = nil }
            )
            .presentationDetents([.medium, .large])
        }
    }

    // MARK: Content

    @ViewBuilder private var content: some View {
        if model.isCaughtUp {
            ScrollView {
                VStack(spacing: BFHRSpace.s6) {
                    ConnectionBanner(model.connection)
                    if model.showsConnectMailCard {
                        InlineAlert(
                            .info,
                            title: TodayStrings.connectTitle,
                            message: TodayStrings.connectBody,
                            actionTitle: TodayStrings.connectAction,
                            action: {},
                            onDismiss: model.dismissConnectMailCard
                        )
                    }
                    EmptyState(.caughtUp, glyph: "checkmark.circle", title: TodayStrings.caughtUpTitle, message: TodayStrings.caughtUpBody)
                }
                .padding(BFHRSpace.s4)
            }
        } else {
            List {
                ConnectionBannerSection(model.connection)
                ForEach(model.sections, id: \.self) { section in
                    Section {
                        rows(for: section)
                    } header: {
                        header(for: section)
                    }
                }
                if !model.done.isEmpty {
                    Section {
                        DisclosureGroup {
                            ForEach(model.done) { item in
                                Text(verbatim: item.company.name)
                                    .font(.bfhr(.subheadline))
                                    .foregroundStyle(BFHRColor.Fg.secondary)
                            }
                        } label: {
                            Text(TodayStrings.doneToday(model.done.count))
                        }
                    }
                }
            }
            .bfhrInsetGroupedList()
        }
    }

    private func header(for section: TodayModel.Section) -> some View {
        HStack(spacing: BFHRSpace.s1) {
            Text(TodayStrings.sectionTitle(section))
            if section == .toReview {
                Text(verbatim: "· \(model.toReviewCount)").monospacedDigit()
            }
        }
        .font(.bfhr(.subheadline, emphasized: true))
        .foregroundStyle(BFHRColor.Fg.secondary)
        .accessibilityAddTraits(.isHeader)
    }

    @ViewBuilder private func rows(for section: TodayModel.Section) -> some View {
        switch section {
        case .nextUp:
            if let next = model.nextUp {
                VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                    CompanyChip(next.company)
                    Text(verbatim: next.title).font(.bfhr(.headline)).foregroundStyle(BFHRColor.Fg.primary)
                    Text(verbatim: next.role).font(.bfhr(.subheadline)).foregroundStyle(BFHRColor.Fg.secondary)
                    RelativeTimeText(next.startsAt, style: .dayAndTime)
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.primary)
                }
                .padding(.vertical, BFHRSpace.s1)
            }
        case .toReview:
            ForEach(model.toReview) { proposal in
                Button { reviewing = proposal } label: { reviewRow(proposal) }
                    .buttonStyle(.plain)
                    .bfhrRowActions([
                        RowAction(Strings.confirm, systemImage: "checkmark", edge: .leading, haptic: .confirm, isEnabled: proposal.canConfirm) {
                            run { try model.confirm(proposal.id) }
                        },
                        RowAction(Strings.snooze, systemImage: "clock", edge: .trailing) {
                            show(model.snooze(proposal.id, until: SnoozePreset.tomorrow.date(from: model.now, calendar: model.calendar)))
                        },
                    ])
            }
            ForEach(model.autoChanges) { item in
                AutoChangeRow(item) { run { try model.undoAutoChange(item.id) } }
                    .bfhrRowActions([
                        RowAction(TodayStrings.looksRight, systemImage: "checkmark", edge: .leading) {
                            if let toast = model.acknowledge(item.id) { show(toast) }
                        },
                    ])
            }
        case .followUps:
            ForEach(model.followUps + model.olderFollowUps) { nudge in
                NudgeCard(nudge, now: model.now, onPrimary: {}, onDismiss: { show(model.notNeeded(nudge.id)) })
                    .padding(.vertical, BFHRSpace.s1)
            }
        case .deadlines:
            ForEach(model.deadlines) { deadline in
                HStack(alignment: .top, spacing: BFHRSpace.s3) {
                    CompanyMonogram(deadline.company)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: deadline.company.name).font(.bfhr(.headline)).foregroundStyle(BFHRColor.Fg.primary)
                        Text(verbatim: deadlineTitle(deadline)).font(.bfhr(.subheadline)).foregroundStyle(BFHRColor.Fg.secondary)
                    }
                    Spacer(minLength: BFHRSpace.s2)
                    RelativeTimeText(deadline.dueAt, style: .dayAndTime)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .multilineTextAlignment(.trailing)
                }
                .accessibilityElement(children: .combine)
                .bfhrRowActions([
                    RowAction(TodayStrings.done, systemImage: "checkmark", edge: .leading, haptic: .confirm) {
                        if let toast = model.markDone(deadline: deadline.id) { show(toast) }
                    },
                ])
            }
        case .newMatches:
            ForEach(model.newMatches) { match in
                HStack(alignment: .top, spacing: BFHRSpace.s3) {
                    CompanyMonogram(match.company)
                    VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                        Text(verbatim: match.title).font(.bfhr(.headline)).foregroundStyle(BFHRColor.Fg.primary)
                        Text(verbatim: match.company.name).font(.bfhr(.subheadline)).foregroundStyle(BFHRColor.Fg.secondary)
                        MatchBandPill(score: match.score)
                        if let reason = match.reason {
                            Text(verbatim: reason).font(.bfhr(.footnote)).foregroundStyle(BFHRColor.Fg.secondary)
                        }
                    }
                    Spacer(minLength: 0)
                    if model.pendingSyncIDs.contains(match.id) { SyncGlyph() }
                }
                .accessibilityElement(children: .combine)
                .bfhrRowActions([
                    RowAction(TodayStrings.save, systemImage: "bookmark", edge: .leading, haptic: .confirm) {
                        show(model.saveMatch(match.id))
                    },
                    RowAction(Strings.notForMe, systemImage: "eye.slash", edge: .trailing) {
                        show(model.notForMe(match.id))
                    },
                ])
            }
        }
    }

    private func reviewRow(_ proposal: ReviewProposal) -> some View {
        HStack(alignment: .top, spacing: BFHRSpace.s3) {
            CompanyMonogram(proposal.company ?? CompanyIdentity(name: proposal.sender.name ?? proposal.sender.address), badge: proposal.category.glyph)
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                Text(Strings.classification(proposal.category, hedged: proposal.isHedged))
                    .font(.bfhr(.headline))
                    .foregroundStyle(BFHRColor.Fg.primary)
                Text(verbatim: [proposal.company?.name, proposal.role].compactMap { $0 }.joined(separator: " · "))
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                HStack(spacing: BFHRSpace.s2) {
                    SourceTag(.email)
                    RelativeTimeText(proposal.receivedAt, style: .day)
                        .font(.bfhr(.caption1))
                        .foregroundStyle(BFHRColor.Fg.tertiary)
                    if model.pendingSyncIDs.contains(proposal.id) { SyncGlyph() }
                }
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private func deadlineTitle(_ deadline: TodayModel.Deadline) -> String {
        switch deadline.kind {
        case .nextAction(let action): action
        default: deadline.title
        }
    }

    // MARK: Skeleton (the real row shapes with placeholder text)

    private var skeleton: some View {
        List {
            ForEach(0..<3, id: \.self) { _ in
                Section {
                    ForEach(0..<2, id: \.self) { _ in
                        HStack(alignment: .top, spacing: BFHRSpace.s3) {
                            CompanyMonogram(CompanyIdentity(name: "Company"))
                            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                                Text(verbatim: "Looks like an interview invite").font(.bfhr(.headline))
                                Text(verbatim: "Company name · Frontend Engineer").font(.bfhr(.subheadline))
                            }
                        }
                    }
                } header: {
                    Text(verbatim: "Section").font(.bfhr(.subheadline, emphasized: true))
                }
            }
        }
        .bfhrInsetGroupedList()
    }

    // MARK: Actions

    private func show(_ toast: ToastItem) {
        toasts?.show(toast)
    }

    private func run(_ action: () throws -> ToastItem) {
        do {
            show(try action())
        } catch {
            show(ToastItem(glyph: ToastGlyph.info, message: TodayStrings.couldntSave))
        }
    }
}

/// Today's strings (table "Today").
enum TodayStrings {
    static let loading = LocalizedStringResource.bfhr("today.loading", default: "Loading today's updates", table: "Today")
    static let errorTitle = LocalizedStringResource.bfhr("today.error.title", default: "We couldn't load today's updates", table: "Today")
    static let caughtUpTitle = LocalizedStringResource.bfhr("today.caughtUp.title", default: "You're all caught up", table: "Today")
    static let caughtUpBody = LocalizedStringResource.bfhr("today.caughtUp.body", default: "New updates will show up here.", table: "Today")
    static let connectTitle = LocalizedStringResource.bfhr("today.connect.title", default: "Connect your email", table: "Today")
    static let connectBody = LocalizedStringResource.bfhr("today.connect.body", default: "See interview invites and replies here. About 2 minutes.", table: "Today")
    static let connectAction = LocalizedStringResource.bfhr("today.connect.action", default: "Connect email", table: "Today")
    static let looksRight = LocalizedStringResource.bfhr("today.action.looksRight", default: "Looks right", table: "Today")
    static let done = LocalizedStringResource.bfhr("today.action.done", default: "Done", table: "Today")
    static let save = LocalizedStringResource.bfhr("today.action.save", default: "Save", table: "Today")
    static let couldntSave = LocalizedStringResource.bfhr("today.toast.couldntSave", default: "That change didn't go through. Try again.", table: "Today")

    static func doneToday(_ count: Int) -> LocalizedStringResource {
        .bfhr("today.doneToday", default: "Done today (\(count))", table: "Today")
    }

    static func sectionTitle(_ section: TodayModel.Section) -> LocalizedStringResource {
        switch section {
        case .nextUp: .bfhr("today.section.nextUp", default: "Next up", table: "Today")
        case .toReview: .bfhr("today.section.toReview", default: "To review", table: "Today")
        case .followUps: .bfhr("today.section.followUps", default: "Follow-ups", table: "Today")
        case .deadlines: .bfhr("today.section.deadlines", default: "Deadlines", table: "Today")
        case .newMatches: .bfhr("today.section.newMatches", default: "New matches", table: "Today")
        }
    }
}
