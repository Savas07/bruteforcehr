import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// Today (docs/design/research/today-home.md, "Decision — iOS"): what needs attention, as an
/// inset-grouped list in a fixed order (Next up · To review · Follow-ups · Deadlines · New
/// matches), empty sections hidden, then the collapsed "Done today". No greeting, no counters
/// beyond the plain "To review · n", nothing red. Every row action is optimistic with an Undo toast;
/// rows open their object's home through the app's deep links (IA.md "Deep links").
public struct TodayScreen: View {
    @Bindable private var model: TodayModel
    @Environment(ToastCenter.self) private var toasts: ToastCenter?
    @Environment(\.openURL) private var openURL
    @Environment(\.locale) private var locale
    @State private var reviewing: ReviewProposal?
    @State private var snoozing: SnoozeRequest?
    @State private var pickingDate: SnoozeRequest?
    @State private var showsOlderFollowUps = false
    @State private var showsDone = false

    public init(model: TodayModel) {
        self.model = model
    }

    public var body: some View {
        PhaseContainer(model.phase, loadingLabel: TodayStrings.loading) {
            content
        } skeleton: {
            TodaySkeleton()
        } failure: { failure in
            PaneError(failure, title: TodayStrings.errorTitle, message: TodayStrings.errorBody, retry: model.retry)
        }
        .bfhrToastHost()
        .environment(\.bfhrNow, model.now)
        .toolbar {
            ToolbarItem(placement: .bfhrTrailing) {
                AvatarButton(name: model.profileName, needsAttention: model.accountNeedsAttention) {
                    openURL(TodayLink.settings)
                }
            }
        }
        .todaySubtitle(dateLine)
        .sheet(item: $reviewing) { proposal in
            ReviewSheet(
                proposal,
                isOffline: model.connection.isOffline,
                onConfirm: { reviewing = nil; run { try model.confirm(proposal.id) } },
                onChange: { reviewing = nil; openURL(TodayLink.mailReview(proposal.id)) },
                onNotJobMail: { reviewing = nil; run { try model.notJobMail(proposal.id) } }
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .confirmationDialog(
            Text(Strings.snooze),
            isPresented: Binding(get: { snoozing != nil }, set: { if !$0 { snoozing = nil } }),
            titleVisibility: .visible,
            presenting: snoozing
        ) { request in
            ForEach(SnoozePreset.allCases, id: \.self) { preset in
                Button { snooze(request, until: preset.date(from: model.now, calendar: model.calendar)) } label: { Text(preset.label) }
            }
            Button { pickingDate = request } label: { Text(Strings.snoozePickDate) }
        } message: { request in
            Text(verbatim: request.subject)
        }
        .sheet(item: $pickingDate) { request in
            SnoozeDateSheet(now: model.now, calendar: model.calendar) { date in
                pickingDate = nil
                snooze(request, until: date)
            } onCancel: {
                pickingDate = nil
            }
            .presentationDetents([.large])
        }
    }

    // MARK: Content

    private var content: some View {
        List {
            ConnectionBannerSection(model.connection)
            if model.showsConnectMailCard {
                Section {
                    InlineAlert(
                        .info,
                        title: TodayStrings.connectTitle,
                        message: TodayStrings.connectBody,
                        actionTitle: TodayStrings.connectAction,
                        action: { openURL(TodayLink.mail) },
                        onDismiss: model.dismissConnectMailCard
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
            }
            if model.isCaughtUp {
                Section {
                    emptyState
                        .listRowBackground(Color.clear)
                }
            }
            ForEach(model.sections, id: \.self) { section in
                Section {
                    rows(for: section)
                } header: {
                    TodaySectionHeader(section: section, count: section == .toReview ? model.toReviewCount : nil)
                } footer: {
                    footer(for: section)
                }
            }
            if !model.done.isEmpty {
                Section {
                    DisclosureGroup(isExpanded: $showsDone) {
                        ForEach(model.done) { item in
                            DoneRow(item: item)
                        }
                    } label: {
                        Text(TodayStrings.doneToday(model.done.count))
                            .font(.bfhr(.body))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                    }
                }
            }
        }
        .bfhrInsetGroupedList()
        .animation(BFHRMotion.spring(reduceMotion: reduceMotion), value: model.sections)
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @ViewBuilder private var emptyState: some View {
        if model.isFirstRun {
            EmptyState(
                .firstUse,
                glyph: "sun.max",
                title: TodayStrings.firstRunTitle,
                message: TodayStrings.firstRunBody,
                primary: .init(TodayStrings.findJobs) { openURL(TodayLink.jobs) }
            )
        } else {
            EmptyState(.caughtUp, glyph: "checkmark.circle", title: TodayStrings.caughtUpTitle, message: TodayStrings.caughtUpBody)
        }
    }

    @ViewBuilder private func footer(for section: TodayModel.Section) -> some View {
        if section == .newMatches {
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                if case .offline(let lastSyncedAt?) = model.connection {
                    StaleStamp(lastSyncedAt)
                }
                Button { openURL(TodayLink.jobs) } label: { Text(TodayStrings.seeAllInJobs) }
                    .buttonStyle(.bfhrPlain)
                    .padding(.leading, -BFHRSpace.s2)
            }
        }
    }

    @ViewBuilder private func rows(for section: TodayModel.Section) -> some View {
        switch section {
        case .nextUp:
            if let next = model.nextUp {
                NextUpCard(next: next, isPendingSync: model.pendingSyncIDs.contains(next.id)) { url in
                    openURL(url)
                }
                .bfhrRowActions(nextUpActions(next))
                DisclosureGroup {
                    NextUpPrep(next: next) { openURL(TodayLink.application(next.applicationId)) }
                } label: {
                    Label { Text(TodayStrings.prep) } icon: { Image(systemName: "list.bullet.clipboard") }
                        .font(.bfhr(.body))
                        .foregroundStyle(BFHRColor.Fg.primary)
                }
            }
        case .toReview:
            ForEach(model.toReview) { proposal in
                Button { reviewing = proposal } label: {
                    ReviewRow(proposal: proposal, isPendingSync: model.pendingSyncIDs.contains(proposal.id))
                }
                .buttonStyle(.plain)
                .accessibilityHint(Text(TodayStrings.reviewHint))
                .bfhrRowActions(reviewActions(proposal))
            }
            ForEach(model.autoChanges) { item in
                AutoChangeRow(item) { run { try model.undoAutoChange(item.id) } }
                    .overlay(alignment: .topTrailing) {
                        if model.pendingSyncIDs.contains(item.id) { SyncGlyph() }
                    }
                    .bfhrRowActions(autoChangeActions(item))
            }
        case .followUps:
            ForEach(model.followUps) { nudge in
                followUpRow(nudge)
            }
            if !model.olderFollowUps.isEmpty {
                DisclosureGroup(isExpanded: $showsOlderFollowUps) {
                    ForEach(model.olderFollowUps) { nudge in
                        followUpRow(nudge)
                    }
                    Button {
                        snoozing = SnoozeRequest(ids: model.olderFollowUps.map(\.id), subject: String(localized: TodayStrings.olderFollowUps(model.olderFollowUps.count)))
                    } label: {
                        Label { Text(TodayStrings.snoozeAll) } icon: { Image(systemName: "clock") }
                            .font(.bfhr(.body))
                            .foregroundStyle(BFHRColor.Accent.text)
                            .frame(minHeight: BFHRHitTarget.minimum)
                    }
                    .buttonStyle(.plain)
                } label: {
                    Text(TodayStrings.olderFollowUps(model.olderFollowUps.count))
                        .font(.bfhr(.body))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
        case .deadlines:
            ForEach(model.deadlines) { deadline in
                DeadlineRow(deadline: deadline, isPendingSync: model.pendingSyncIDs.contains(deadline.id))
                    .bfhrRowActions(deadlineActions(deadline))
            }
        case .newMatches:
            ForEach(model.newMatches) { match in
                MatchRow(
                    match: match,
                    isPendingSync: model.pendingSyncIDs.contains(match.id),
                    onOpen: { openURL(TodayLink.job(match.id)) },
                    onSave: { show(model.saveMatch(match.id)) },
                    onNotForMe: { show(model.notForMe(match.id)) }
                )
                .bfhrRowActions(matchActions(match))
            }
        }
    }

    private func followUpRow(_ nudge: NudgeItem) -> some View {
        FollowUpRow(
            nudge: nudge,
            now: model.now,
            isPendingSync: model.pendingSyncIDs.contains(nudge.id),
            onDraft: { draftFollowUp(nudge) }
        )
        .bfhrRowActions(followUpActions(nudge))
    }

    // MARK: Row actions (IA.md "iOS gestures and menus": leading = primary positive, trailing =
    // Snooze · Not needed / Not for me, context menu = the same + Open application)

    private func nextUpActions(_ next: TodayModel.NextUp) -> [RowAction] {
        var actions: [RowAction] = []
        if next.isJoinable, let url = next.meetingURL {
            actions.append(RowAction(TodayStrings.join, systemImage: "video", edge: .leading) { openURL(url) })
        }
        actions.append(openApplicationAction(next.applicationId))
        return actions
    }

    private func reviewActions(_ proposal: ReviewProposal) -> [RowAction] {
        var actions = [
            RowAction(Strings.confirm, systemImage: "checkmark", edge: .leading, haptic: .confirm, isEnabled: proposal.canConfirm) {
                run { try model.confirm(proposal.id) }
            },
            RowAction(Strings.snooze, systemImage: "clock", edge: .trailing) {
                snoozing = SnoozeRequest(ids: [proposal.id], subject: subject(of: proposal))
            },
            RowAction(Strings.notJobMail, systemImage: "tray", edge: .trailing) {
                run { try model.notJobMail(proposal.id) }
            },
            RowAction(TodayStrings.review, systemImage: "text.magnifyingglass", edge: .menuOnly) {
                reviewing = proposal
            },
        ]
        if let applicationId = proposal.applicationId {
            actions.append(openApplicationAction(applicationId))
        }
        return actions
    }

    private func autoChangeActions(_ item: AutoChangeItem) -> [RowAction] {
        [
            RowAction(TodayStrings.looksRight, systemImage: "checkmark", edge: .leading) {
                if let toast = model.acknowledge(item.id) { show(toast) }
            },
            openApplicationAction(item.applicationId),
        ]
    }

    private func followUpActions(_ nudge: NudgeItem) -> [RowAction] {
        [
            RowAction(TodayStrings.followUpShort, systemImage: "envelope", edge: .leading) { draftFollowUp(nudge) },
            RowAction(Strings.snooze, systemImage: "clock", edge: .trailing) {
                snoozing = SnoozeRequest(ids: [nudge.id], subject: "\(nudge.company.name) · \(nudge.role)")
            },
            RowAction(Strings.notNeeded, systemImage: "xmark", edge: .trailing) { show(model.notNeeded(nudge.id)) },
            openApplicationAction(nudge.applicationId),
        ]
    }

    private func deadlineActions(_ deadline: TodayModel.Deadline) -> [RowAction] {
        var actions = [
            RowAction(TodayStrings.done, systemImage: "checkmark", edge: .leading, haptic: .confirm) {
                if let toast = model.markDone(deadline: deadline.id) { show(toast) }
            },
            RowAction(Strings.snooze, systemImage: "clock", edge: .trailing) {
                snoozing = SnoozeRequest(ids: [deadline.id], subject: "\(deadline.company.name) · \(deadline.title)")
            },
        ]
        if let applicationId = deadline.applicationId {
            actions.append(openApplicationAction(applicationId))
        } else if let jobId = deadline.jobId {
            actions.append(RowAction(TodayStrings.openJob, systemImage: "briefcase", edge: .menuOnly) { openURL(TodayLink.job(jobId)) })
        }
        return actions
    }

    private func matchActions(_ match: TodayModel.NewMatch) -> [RowAction] {
        [
            RowAction(TodayStrings.save, systemImage: "bookmark", edge: .leading, haptic: .confirm) { show(model.saveMatch(match.id)) },
            RowAction(Strings.notForMe, systemImage: "hand.thumbsdown", edge: .trailing) { show(model.notForMe(match.id)) },
            RowAction(TodayStrings.openJob, systemImage: "briefcase", edge: .menuOnly) { openURL(TodayLink.job(match.id)) },
        ]
    }

    private func openApplicationAction(_ applicationId: String) -> RowAction {
        RowAction(TodayStrings.openApplication, systemImage: "rectangle.split.3x1", edge: .menuOnly) {
            openURL(TodayLink.application(applicationId))
        }
    }

    // MARK: Helpers

    private var dateLine: String {
        model.now.formatted(
            Date.FormatStyle(locale: locale, calendar: model.calendar, timeZone: model.calendar.timeZone)
                .weekday(.wide).day().month(.wide)
        )
    }

    private func subject(of proposal: ReviewProposal) -> String {
        proposal.company?.name ?? proposal.sender.name ?? proposal.sender.address
    }

    /// "Draft follow-up" opens the job's Apply sheet in compose mode (IA.md deep links); an
    /// application without a job opens its detail.
    private func draftFollowUp(_ nudge: NudgeItem) {
        if let jobId = model.jobId(forApplication: nudge.applicationId) {
            openURL(TodayLink.apply(jobId: jobId))
        } else {
            openURL(TodayLink.application(nudge.applicationId))
        }
    }

    private func snooze(_ request: SnoozeRequest, until date: Date) {
        snoozing = nil
        if request.ids.count == 1, let id = request.ids.first {
            show(model.snooze(id, until: date))
        } else {
            show(model.snoozeAll(request.ids, until: date))
        }
    }

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

/// What the snooze dialog acts on: one item, or every older follow-up ("Snooze all").
struct SnoozeRequest: Identifiable {
    var ids: [String]
    var subject: String
    var id: String { ids.joined(separator: ",") }
}

extension View {
    /// The date under the large title ("Wednesday, 22 October"); iOS 26 shows navigation subtitles.
    @ViewBuilder func todaySubtitle(_ text: String) -> some View {
        #if os(iOS)
        if #available(iOS 26.0, *) {
            navigationSubtitle(text)
        } else {
            self
        }
        #else
        navigationSubtitle(text)
        #endif
    }
}
