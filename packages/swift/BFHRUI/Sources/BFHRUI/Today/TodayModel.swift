import BFHRCore
import Foundation
import Observation

/// Today (docs/design/research/today-home.md, "Decision — iOS"): fixed sections, most
/// time-sensitive first, empty sections hidden. Next up · To review · Follow-ups · Deadlines ·
/// New matches, then "Done today".
@Observable
public final class TodayModel: ScreenModel {
    public enum Section: String, CaseIterable, Hashable, Sendable {
        case nextUp
        case toReview
        case followUps
        case deadlines
        case newMatches
    }

    /// The next interview within `nextUpWindow` (48 h), or one in progress.
    public struct NextUp: Identifiable, Hashable, Sendable {
        public var id: String
        public var applicationId: String
        public var company: CompanyIdentity
        public var role: String
        public var title: String
        public var kind: InterviewKind
        public var round: Int
        public var startsAt: Date
        public var endsAt: Date
        /// The interviewer's time zone, shown as a second time when it differs from the user's.
        public var timeZone: TimeZone?
        public var meetingURL: URL?
        public var location: String?
        public var people: [InterviewPerson]
        public var prepNotes: String
        /// "Join" shows from 10 minutes before the start until the end.
        public var isJoinable: Bool
    }

    public struct Deadline: Identifiable, Hashable, Sendable {
        public enum Kind: Hashable, Sendable {
            case assessment
            case replyBy
            case nextAction(String)
            case jobCloses
        }

        public var id: String
        public var kind: Kind
        public var company: CompanyIdentity
        public var title: String
        public var applicationId: String?
        public var jobId: String?
        public var dueAt: Date
    }

    public struct NewMatch: Identifiable, Hashable, Sendable {
        /// The job id.
        public var id: String
        public var title: String
        public var company: CompanyIdentity
        public var score: Int
        public var band: MatchBand
        /// The first reason, as written by the matcher ("Remote within the EU").
        public var reason: String?
    }

    /// A handled item in "Done today", cleared at local midnight.
    public struct DoneItem: Identifiable, Hashable, Sendable {
        public var id: String
        public var company: CompanyIdentity
        public var summary: String
        public var at: Date
    }

    public static let nextUpWindow: TimeInterval = 48 * 3600
    public static let deadlineWindowDays = 7
    public static let newMatchLimit = 3
    /// Follow-up suggestions older than this collapse into "Older suggestions (n)".
    public static let olderFollowUpDays = 14

    public var phase: LoadPhase = .loading
    public var connection: ConnectionState = .online
    public var pendingSyncIDs: Set<String> = []

    /// The clock for relative values and for the time stamped on writes. The data layer advances it.
    public var now: Date {
        didSet { recompute() }
    }
    public let calendar: Calendar
    public private(set) var data = UserData.empty

    /// Persists every mutation (the app's Firestore store); nil in tests and design mode.
    public weak var writer: (any UserDataWriter)?
    /// Live data: writes are stamped with the system clock.
    public var usesSystemClock = false
    /// Counts writes the server refused; the screen shows a toast when it changes.
    public private(set) var writeFailures = 0
    /// Email (M5) and job matching (M4) are switched on. Until then Today says so calmly instead
    /// of offering a connect card or "Find jobs" that lead nowhere.
    public var mailAvailable = true
    public var matchesAvailable = true

    var writeTime: Date { usesSystemClock ? .now : now }
    /// Insights is wired into the Tracker (the host sets it): Today's footer links to it once
    /// there is something to count.
    public var insightsAvailable = false
    public var showsInsightsLink: Bool { insightsAvailable && !data.applications.isEmpty }

    public private(set) var nextUp: NextUp?
    public private(set) var toReview: [ReviewProposal] = []
    /// Automatic changes not yet acknowledged (Undo / swipe to acknowledge).
    public private(set) var autoChanges: [AutoChangeItem] = []
    public private(set) var followUps: [NudgeItem] = []
    public private(set) var olderFollowUps: [NudgeItem] = []
    public private(set) var deadlines: [Deadline] = []
    public private(set) var newMatches: [NewMatch] = []
    public private(set) var done: [DoneItem] = []

    /// Item ids snoozed until a date (local until the data layer persists it on the source doc).
    private var snoozedUntil: [String: Date] = [:]
    private var dismissed: Set<String> = []

    public init(now: Date = .now, calendar: Calendar = .current) {
        self.now = now
        self.calendar = calendar
    }

    public func load(_ data: UserData) {
        self.data = data
        recompute()
        phase = .loaded
    }

    /// Runs a mutation on `data`, recomputes and hands the changed documents to `writer` as one
    /// batch (see `TrackerBoardModel.mutate`).
    @discardableResult
    func mutate<Result>(_ body: (inout UserData) throws -> Result) rethrows -> Result {
        let before = data
        let result = try body(&data)
        let changes = UserDataChanges(from: before, to: data)
        if !changes.isEmpty, let writer {
            Task { [weak self] in
                do {
                    try await writer.commit(changes)
                } catch {
                    self?.writeFailures += 1
                }
            }
        }
        return result
    }

    // MARK: Derived

    /// Visible sections in their fixed order (empty ones are hidden, never "0").
    public var sections: [Section] {
        Section.allCases.filter { section in
            switch section {
            case .nextUp: nextUp != nil
            case .toReview: !toReview.isEmpty || !autoChanges.isEmpty
            case .followUps: !followUps.isEmpty || !olderFollowUps.isEmpty
            case .deadlines: !deadlines.isEmpty
            case .newMatches: !newMatches.isEmpty
            }
        }
    }

    /// "To review · 3" header count (plain text; the badge lives on the Mail tab).
    public var toReviewCount: Int { toReview.count }

    public var hasMailAccount: Bool { !data.mailAccounts.isEmpty }

    /// Mail accounts that need the user (amber dot on the avatar).
    public var accountNeedsAttention: Bool {
        data.mailAccounts.contains { $0.status == .needsReauth || $0.status == .error }
    }

    /// Newly connected inboxes still being checked (the compact scanning card).
    public var scanningAccounts: [MailAccountItem] {
        data.mailAccounts.map(MailAccountItem.init).filter(\.isScanning)
    }

    /// No mail account yet: show the dismissible "Connect your email" card (once email is
    /// available, M5).
    public var showsConnectMailCard: Bool { mailAvailable && !hasMailAccount && !dismissed.contains(Self.connectCardID) }

    /// Email or matching isn't switched on yet: the quiet line under Today says what will appear.
    public var showsComingNote: Bool { !mailAvailable || !matchesAvailable }

    /// Everything handled: "You're all caught up."
    public var isCaughtUp: Bool { sections.isEmpty }

    /// Nothing to show because nothing exists yet (no mail account, no applications, no matches):
    /// the first-use empty state instead of "You're all caught up".
    public var isFirstRun: Bool {
        isCaughtUp && !hasMailAccount && data.applications.isEmpty && data.jobMatches.isEmpty
    }

    public var profileName: String { data.profile?.fullName ?? "" }

    static let connectCardID = "today.connectMail"

    private func recompute() {
        let visible: (String) -> Bool = { [snoozedUntil, dismissed, now] id in
            !dismissed.contains(id) && (snoozedUntil[id].map { $0 <= now } ?? true)
        }
        nextUp = makeNextUp()
        toReview = data.reviewQueue().filter { visible($0.id) }
        let recent = calendar.date(byAdding: .day, value: -7, to: now) ?? now
        autoChanges = data.autoChanges(since: recent).filter { item in
            guard visible(item.id) else { return false }
            // Stays until acknowledged: an acknowledged email is `confirmed`.
            guard let messageId = item.mailMessageId, let message = data.mailMessage(id: messageId) else { return true }
            return message.reviewState == .autoApplied
        }
        let nudges = data.nudges(at: now).filter { visible($0.id) }.filter {
            if case .followUp = $0.kind { true } else { false }
        }
        followUps = nudges.filter { $0.days(at: now, calendar: calendar) < Self.olderFollowUpDays }
        olderFollowUps = nudges.filter { $0.days(at: now, calendar: calendar) >= Self.olderFollowUpDays }
        deadlines = makeDeadlines().filter { visible($0.id) }
        newMatches = makeNewMatches().filter { visible($0.id) }
        let midnight = calendar.startOfDay(for: now)
        done = done.filter { $0.at >= midnight }
    }

    private func makeNextUp() -> NextUp? {
        let candidates = data.interviews
            .filter { interview in
                let end = interview.startsAt.addingTimeInterval(TimeInterval(interview.durationMinutes * 60))
                return end > now && interview.startsAt <= now.addingTimeInterval(Self.nextUpWindow)
            }
            .sorted { $0.startsAt < $1.startsAt }
        guard let interview = candidates.first, let application = data.application(id: interview.applicationId) else { return nil }
        let end = interview.startsAt.addingTimeInterval(TimeInterval(interview.durationMinutes * 60))
        return NextUp(
            id: interview.id,
            applicationId: application.id,
            company: CompanyIdentity(name: application.company, domain: application.companyDomain),
            role: application.role,
            title: interview.title,
            kind: interview.kind,
            round: interview.round,
            startsAt: interview.startsAt,
            endsAt: end,
            timeZone: TimeZone(identifier: interview.timezone),
            meetingURL: interview.meetingUrl.flatMap(URL.init(string:)),
            location: interview.location,
            people: interview.people,
            prepNotes: interview.prepNotes,
            isJoinable: now >= interview.startsAt.addingTimeInterval(-10 * 60) && now < end
        )
    }

    private func makeDeadlines() -> [Deadline] {
        guard let horizon = calendar.date(byAdding: .day, value: Self.deadlineWindowDays, to: now) else { return [] }
        let inWindow: (Date) -> Bool = { [now] in $0 >= now && $0 <= horizon }
        var items: [Deadline] = []
        for message in data.mailMessages {
            guard let applicationId = message.applicationId, let application = data.application(id: applicationId), application.status.isActive else { continue }
            for date in message.extracted.dates where inWindow(date.at) {
                let kind: Deadline.Kind
                switch date.kind {
                case .assessmentDeadline: kind = .assessment
                case .replyDeadline: kind = .replyBy
                default: continue
                }
                items.append(Deadline(
                    id: "\(message.id).\(date.kind.rawValue)",
                    kind: kind,
                    company: CompanyIdentity(name: application.company, domain: application.companyDomain),
                    title: date.label,
                    applicationId: application.id,
                    jobId: application.jobId,
                    dueAt: date.at
                ))
            }
        }
        for application in data.applications where application.status.isActive {
            guard let due = application.nextActionAt, inWindow(due), let action = application.nextAction else { continue }
            // An interview at the same time is already Next up / in the agenda.
            if data.interviews(forApplication: application.id).contains(where: { $0.startsAt == due }) { continue }
            if items.contains(where: { $0.applicationId == application.id && $0.dueAt == due }) { continue }
            items.append(Deadline(
                id: "\(application.id).nextAction",
                kind: .nextAction(action),
                company: CompanyIdentity(name: application.company, domain: application.companyDomain),
                title: application.role,
                applicationId: application.id,
                jobId: application.jobId,
                dueAt: due
            ))
        }
        for match in data.jobMatches where match.state == .saved {
            guard let job = data.job(id: match.id), let expires = job.expiresAt, inWindow(expires) else { continue }
            guard data.application(forJob: job.id).map({ !$0.status.isActive || $0.status == .saved }) ?? true else { continue }
            items.append(Deadline(
                id: "\(job.id).closes",
                kind: .jobCloses,
                company: CompanyIdentity(name: job.company, domain: job.companyDomain),
                title: job.title,
                applicationId: nil,
                jobId: job.id,
                dueAt: expires
            ))
        }
        return items.sorted { $0.dueAt < $1.dueAt }
    }

    private func makeNewMatches() -> [NewMatch] {
        data.jobMatches
            .filter { $0.state == .new && data.application(forJob: $0.id) == nil }
            .sorted { ($0.score, $1.id) > ($1.score, $0.id) }
            .prefix(Self.newMatchLimit)
            .compactMap { match in
                guard let job = data.job(id: match.id) else { return nil }
                return NewMatch(
                    id: job.id,
                    title: job.title,
                    company: CompanyIdentity(name: job.company, domain: job.companyDomain),
                    score: match.score,
                    band: matchBand(match.score),
                    reason: match.reasons.first?.label
                )
            }
    }

    // MARK: Actions

    /// Confirms a review item as proposed: the server links the email and makes the move. Undo
    /// (inside the toast's window, before the write leaves the device) puts the email back.
    public func confirm(_ proposalId: String) throws -> ToastItem {
        guard let proposal = toReview.first(where: { $0.id == proposalId }), let before = data.mailMessage(id: proposalId) else {
            throw UserDataError.missingMailMessage(proposalId)
        }
        guard proposal.canConfirm else { throw UserDataError.missingApplication(proposalId) }
        let move = try mutate { try $0.review(proposalId, .confirm, at: writeTime) }
        recordWrite(proposalId)
        markDone(proposalId, company: proposal.company, summary: proposal.subject)
        recompute()
        let company = proposal.company?.name ?? proposal.sender.name ?? proposal.sender.address
        let message: LocalizedStringResource = if let move {
            .bfhr("today.toast.confirmedMove", default: "Confirmed: \(company) moved to \(move.label)", table: "Today")
        } else {
            .bfhr("today.toast.confirmed", default: "Confirmed: \(company)", table: "Today")
        }
        return ToastItem(glyph: ToastGlyph.confirmed, message: message, action: .undo { [weak self] in
            self?.restore(before)
            self?.undoDone(proposalId)
        })
    }

    /// Acknowledges an automatic change ("Looks right"): the row leaves To review. For an invite
    /// that suggests an interview, this is "Add interview" (the server creates it). Undo (inside
    /// the toast's window) puts the row back.
    public func acknowledge(_ autoChangeId: String) -> ToastItem? {
        guard let item = autoChanges.first(where: { $0.id == autoChangeId }) else { return nil }
        let before = item.mailMessageId.flatMap { data.mailMessage(id: $0) }
        if let messageId = item.mailMessageId { _ = try? mutate { try $0.confirmAutoApplied(messageId, at: writeTime) } }
        recordWrite(autoChangeId)
        markDone(autoChangeId, company: item.company, summary: item.role)
        recompute()
        let message: LocalizedStringResource = item.interviewSuggestion != nil
            ? .bfhr("today.toast.interviewAdded", default: "Interview added: \(item.company.name)", table: "Today")
            : .bfhr("today.toast.acknowledged", default: "\(item.company.name) · marked as seen", table: "Today")
        return ToastItem(glyph: ToastGlyph.confirmed, message: message, action: .undo { [weak self] in
            if let before { self?.restore(before) }
            self?.undoDone(autoChangeId)
        })
    }

    /// "Not job mail" on a review item: the server forgets the email. Undo (inside the toast's
    /// window) puts it back.
    public func notJobMail(_ proposalId: String) throws -> ToastItem {
        guard let proposal = toReview.first(where: { $0.id == proposalId }), let before = data.mailMessage(id: proposalId) else {
            throw UserDataError.missingMailMessage(proposalId)
        }
        try mutate { try $0.review(proposalId, .notJobMail, at: writeTime) }
        recordWrite(proposalId)
        markDone(proposalId, company: proposal.company, summary: proposal.subject)
        recompute()
        let company = proposal.company?.name ?? proposal.sender.name ?? proposal.sender.address
        return ToastItem(
            glyph: ToastGlyph.hidden,
            message: .bfhr("today.toast.notJobMail", default: "\(company) · not job mail", table: "Today"),
            action: .undo { [weak self] in
                self?.restore(before)
                self?.undoDone(proposalId)
            }
        )
    }

    /// Puts an email back as it was before an action (Undo); the data layer drops the held write.
    private func restore(_ message: MailMessage) {
        mutate { data in
            guard let index = data.mailMessages.firstIndex(where: { $0.id == message.id }) else { return }
            data.mailMessages[index] = message
        }
        recompute()
    }

    /// "Snooze all" on the older follow-up suggestions. Undo brings them all back.
    public func snoozeAll(_ itemIds: [String], until date: Date) -> ToastItem {
        for id in itemIds {
            snoozedUntil[id] = date
            recordWrite(id)
        }
        recompute()
        return ToastItem(
            glyph: ToastGlyph.snoozed,
            message: .bfhr("today.toast.snoozedAll", default: "\(itemIds.count) suggestions · snoozed", table: "Today"),
            action: .undo { [weak self] in
                for id in itemIds { self?.snoozedUntil[id] = nil }
                self?.recompute()
            },
            isBulk: true
        )
    }

    /// The application behind a Today item, for "Open application".
    public func applicationId(for itemId: String) -> String? {
        if let item = toReview.first(where: { $0.id == itemId }) { return item.applicationId }
        if let item = autoChanges.first(where: { $0.id == itemId }) { return item.applicationId }
        if let item = (followUps + olderFollowUps).first(where: { $0.id == itemId }) { return item.applicationId }
        if let item = deadlines.first(where: { $0.id == itemId }) { return item.applicationId }
        if let interview = nextUp, interview.id == itemId { return interview.applicationId }
        return nil
    }

    /// The job behind an application, for "Draft follow-up" (the Apply sheet's compose step).
    public func jobId(forApplication applicationId: String) -> String? {
        data.application(id: applicationId)?.jobId
    }

    /// Undoes an automatic change (reverse event; the email goes back for review).
    public func undoAutoChange(_ autoChangeId: String) throws -> ToastItem {
        guard let item = autoChanges.first(where: { $0.id == autoChangeId }) else { throw UserDataError.missingEvent(autoChangeId) }
        try mutate { try $0.undoAutoChange(autoChangeId, at: writeTime) }
        recordWrite(autoChangeId)
        recompute()
        let back = item.from ?? item.to
        return ToastItem(glyph: ToastGlyph.restored, message: .bfhr(
            "today.toast.autoUndone", default: "\(item.company.name) · back in \(back.label)", table: "Today"
        ))
    }

    /// Hides an item until `date`. A follow-up's snooze and a reminder's new date are kept on the
    /// application; other items are snoozed on this device. Undo brings it back.
    public func snooze(_ itemId: String, until date: Date) -> ToastItem {
        let company = companyName(for: itemId)
        let undo: @MainActor () -> Void
        if let applicationId = followUpApplication(itemId) {
            _ = try? mutate { try $0.answerSuggestion(applicationId, .followUp, .snoozed(until: date), now: writeTime) }
            undo = { [weak self] in
                guard let self else { return }
                _ = try? mutate { try $0.answerSuggestion(applicationId, .followUp, nil, now: self.writeTime) }
                recompute()
            }
        } else if let application = reminderApplication(itemId) {
            let previous = application.nextActionAt
            _ = try? mutate { try $0.setReminder(application.id, text: application.nextAction, at: date, now: writeTime) }
            undo = { [weak self] in
                guard let self else { return }
                _ = try? mutate { try $0.setReminder(application.id, text: application.nextAction, at: previous, now: self.writeTime) }
                recompute()
            }
        } else {
            snoozedUntil[itemId] = date
            recordWrite(itemId)
            undo = { [weak self] in
                self?.snoozedUntil[itemId] = nil
                self?.recompute()
            }
        }
        recompute()
        return ToastItem(
            glyph: ToastGlyph.snoozed,
            message: .bfhr("today.toast.snoozed", default: "\(company) · snoozed", table: "Today"),
            action: .undo(perform: undo)
        )
    }

    /// "Not needed" for a follow-up suggestion: kept on the application (decisions.md F9).
    public func notNeeded(_ nudgeId: String) -> ToastItem {
        let company = companyName(for: nudgeId)
        let applicationId = followUpApplication(nudgeId)
        if let applicationId {
            _ = try? mutate { try $0.answerSuggestion(applicationId, .followUp, .dismissed, now: writeTime) }
        } else {
            dismissed.insert(nudgeId)
            recordWrite(nudgeId)
        }
        markDone(nudgeId, company: CompanyIdentity(name: company), summary: "")
        recompute()
        return ToastItem(
            glyph: ToastGlyph.hidden,
            message: .bfhr("today.toast.notNeeded", default: "\(company) · follow-up not needed", table: "Today"),
            action: .undo { [weak self] in
                guard let self else { return }
                if let applicationId {
                    _ = try? mutate { try $0.answerSuggestion(applicationId, .followUp, nil, now: self.writeTime) }
                }
                dismissed.remove(nudgeId)
                undoDone(nudgeId)
            }
        )
    }

    /// Marks a deadline handled. A reminder (next action) is cleared on the application; Undo
    /// puts it back.
    public func markDone(deadline deadlineId: String) -> ToastItem? {
        guard let deadline = deadlines.first(where: { $0.id == deadlineId }) else { return nil }
        let reminder = reminderApplication(deadlineId)
        if let reminder {
            _ = try? mutate { try $0.setReminder(reminder.id, text: nil, at: nil, now: writeTime) }
        } else {
            dismissed.insert(deadlineId)
            recordWrite(deadlineId)
        }
        markDone(deadlineId, company: deadline.company, summary: deadline.title)
        recompute()
        return ToastItem(
            glyph: ToastGlyph.confirmed,
            message: .bfhr("today.toast.done", default: "\(deadline.company.name) · done", table: "Today"),
            action: .undo { [weak self] in
                guard let self else { return }
                if let reminder {
                    _ = try? mutate { try $0.setReminder(reminder.id, text: reminder.nextAction, at: reminder.nextActionAt, now: self.writeTime) }
                }
                dismissed.remove(deadlineId)
                undoDone(deadlineId)
            }
        )
    }

    /// The application of a follow-up suggestion id (`<applicationId>.followUp`).
    private func followUpApplication(_ itemId: String) -> String? {
        (followUps + olderFollowUps).first { $0.id == itemId }?.applicationId
    }

    /// The application whose reminder a deadline id is (`<applicationId>.nextAction`).
    private func reminderApplication(_ itemId: String) -> Application? {
        guard let deadline = deadlines.first(where: { $0.id == itemId }), case .nextAction = deadline.kind,
              let applicationId = deadline.applicationId else { return nil }
        return data.application(id: applicationId)
    }

    /// Saves a new match (`confirm` haptic in the view).
    public func saveMatch(_ jobId: String) -> ToastItem {
        let company = companyName(for: jobId)
        mutate { $0.saveJob(jobId, at: writeTime) }
        recordWrite(jobId)
        recompute()
        return ToastItem(
            glyph: ToastGlyph.saved,
            message: .bfhr("today.toast.saved", default: "\(company) · saved to Jobs", table: "Today"),
            action: .undo { [weak self] in
                guard let self else { return }
                self.mutate { $0.unsaveJob(jobId, at: self.writeTime) }
                self.recompute()
            }
        )
    }

    /// "Not for me" on a new match: hidden from the feed, silent.
    public func notForMe(_ jobId: String) -> ToastItem {
        mutate { $0.setMatchState(jobId, to: .dismissed, at: writeTime) }
        recordWrite(jobId)
        recompute()
        return ToastItem(
            glyph: ToastGlyph.hidden,
            message: .bfhr("today.toast.hidden", default: "Hidden from your feed", table: "Today"),
            action: .undo { [weak self] in
                guard let self else { return }
                self.mutate { $0.setMatchState(jobId, to: .new, at: self.writeTime) }
                self.recompute()
            }
        )
    }

    /// Hides the connect-mail card (it comes back from Settings › Mail accounts).
    public func dismissConnectMailCard() {
        dismissed.insert(Self.connectCardID)
    }

    // MARK: Helpers

    private func companyName(for itemId: String) -> String {
        if let item = toReview.first(where: { $0.id == itemId }) { return item.company?.name ?? item.sender.address }
        if let item = autoChanges.first(where: { $0.id == itemId }) { return item.company.name }
        if let item = (followUps + olderFollowUps).first(where: { $0.id == itemId }) { return item.company.name }
        if let item = deadlines.first(where: { $0.id == itemId }) { return item.company.name }
        if let item = newMatches.first(where: { $0.id == itemId }) { return item.company.name }
        if let interview = nextUp, interview.id == itemId { return interview.company.name }
        return ""
    }

    private func markDone(_ id: String, company: CompanyIdentity?, summary: String) {
        done.insert(DoneItem(id: id, company: company ?? CompanyIdentity(name: ""), summary: summary, at: now), at: 0)
    }

    private func undoDone(_ id: String) {
        done.removeAll { $0.id == id }
        recompute()
    }
}
