import BFHRCore
import Foundation
import Observation

/// The Mail tab (docs/design/research/mail-review.md, "Decision — iOS"): the To review queue,
/// automatic Updates of the last 14 days and All job mail, filtered by account, plus the review
/// sheet's editable draft.
@Observable
public final class MailReviewModel: ScreenModel {
    public var phase: LoadPhase = .loading
    public var connection: ConnectionState = .online
    public var pendingSyncIDs: Set<String> = []

    /// The clock for relative times, the 14-day Updates window and new events. The data layer may
    /// advance it.
    public var now: Date {
        didSet { recompute() }
    }
    public let calendar: Calendar

    public private(set) var data: UserData = .empty

    // MARK: Accounts

    /// Connected mailboxes in data order (title menu: All accounts + one row each).
    public private(set) var accounts: [MailAccountItem] = []

    /// nil: All accounts. Setting an unknown id falls back to all accounts.
    public var accountFilter: String? {
        get { selectedAccountId }
        set {
            selectedAccountId = newValue.flatMap { id in accounts.contains { $0.id == id } ? id : nil }
            recompute()
        }
    }

    /// No mailbox connected: the connect card instead of the lists.
    public var hasAccounts: Bool { !accounts.isEmpty }

    /// More than one mailbox: review rows show the account dot.
    public var showsAccountDot: Bool { accounts.count > 1 }

    /// Filtered accounts that need sign-in or failed (non-dismissible Reconnect banner each).
    public var needsAttention: [MailAccountItem] { filteredAccounts.filter(\.needsAttention) }

    /// Latest sync of the filtered accounts ("Checked 3 min ago").
    public var lastChecked: Date? { filteredAccounts.compactMap(\.lastSyncedAt).max() }

    // MARK: Filter

    /// The active chip. Defaults on first load to To review when it has items, else Updates;
    /// after the user picks a chip it stays.
    public var filter: MailFilter {
        get { selectedFilter }
        set {
            selectedFilter = newValue
            userChoseFilter = true
        }
    }

    public private(set) var counts = MailFilterCounts()

    /// Account-filtered job mail per category (the "Category ▾" menu).
    public private(set) var categoryCounts: [MailCategory: Int] = [:]

    /// The Mail tab badge: every pending email across accounts.
    public private(set) var badgeCount = 0

    // MARK: Lists

    /// The review queue, newest first; emails put off with Review later sit at the bottom.
    public private(set) var toReview: [ReviewProposal] = []

    /// Automatic changes from email in the last 14 days, newest first, minus those marked seen.
    public private(set) var updates: [AutoChangeItem] = []

    /// All job mail for the active category (all categories unless the filter names one).
    public var allJobMail: [MailListItem] {
        let category: MailCategory? = if case .allJobMail(let category) = filter { category } else { nil }
        return jobMailItems.compactMap { item in
            switch item {
            case .message(var row):
                guard category == nil || row.category == category else { return nil }
                row.isPendingSync = pendingSyncIDs.contains(row.id)
                return .message(row)
            case .jobAlerts:
                return category == nil || category == .jobAlert ? item : nil
            }
        }
    }

    /// Emails put off with Review later, in the order they were put off.
    public private(set) var reviewLaterIDs: [String] = []

    // MARK: Review sheet

    /// The open review sheet's fields; nil when no sheet is open.
    public var draft: ReviewDraft?

    /// The email under review (evidence block, proposal sentence, reason line).
    public var reviewing: ReviewProposal? {
        draft.flatMap { data.mailMessage(id: $0.messageId) }.map(data.reviewProposal(for:))
    }

    /// Confirm is enabled for the open draft.
    public var canConfirm: Bool { draft.map(canConfirm) ?? false }

    /// Category picker options. "Not job mail" is its own action, so it isn't a category choice.
    public var categoryOptions: [MailCategory] { MailCategory.allCases.filter { $0 != .notJob } }

    /// Application picker options, by company then role.
    public private(set) var applicationOptions: [ApplicationOption] = []

    /// Status picker for the draft's application: every status, the current one checked, user
    /// moves the state machine denies disabled with their reason. Empty without an application.
    public var statusTargets: [MoveTarget] {
        draft?.applicationId.map { data.moveTargets(for: $0) } ?? []
    }

    // MARK: Private state

    private var selectedAccountId: String?
    private var selectedFilter: MailFilter = .toReview
    private var userChoseFilter = false
    private var hasLoaded = false
    private var seenUpdateIDs: Set<String> = []
    private var jobMailItems: [MailListItem] = []

    private static let updatesWindowDays = 14

    public init(now: Date = .now, calendar: Calendar = .current) {
        self.now = now
        self.calendar = calendar
    }

    public func load(_ data: UserData) {
        self.data = data
        recompute()
        if !hasLoaded && !userChoseFilter {
            selectedFilter = counts.toReview > 0 ? .toReview : .updates
        }
        hasLoaded = true
        phase = .loaded
    }

    // MARK: Review sheet

    /// Opens the review sheet for `messageId` with the email's proposal as the draft.
    @discardableResult
    public func beginReview(_ messageId: String) -> ReviewDraft? {
        guard let message = data.mailMessage(id: messageId) else { return nil }
        let linked = message.applicationId.flatMap { data.application(id: $0) }
        draft = ReviewDraft(
            messageId: message.id,
            category: message.category == .notJob ? nil : message.category,
            applicationId: linked?.id,
            status: message.suggestedStatus
        )
        return draft
    }

    public func endReview() { draft = nil }

    /// Every required field is set and the user may make the move.
    public func canConfirm(_ draft: ReviewDraft) -> Bool {
        guard draft.category != nil, let applicationId = draft.applicationId,
              let application = data.application(id: applicationId) else { return false }
        guard let status = draft.status, status != application.status else { return true }
        return canTransition(from: application.status, to: status, actor: .user).isAllowed
    }

    // MARK: Actions

    /// Confirms the email's proposal, or the sheet's corrected `draft`. Moves the linked
    /// application when the status differs. Undo reverts the move and puts the email back in
    /// To review.
    @discardableResult
    public func confirm(_ messageId: String, draft: ReviewDraft? = nil) throws -> ToastItem {
        guard let previous = data.mailMessage(id: messageId) else {
            throw UserDataError.missingMailMessage(messageId)
        }
        let event: ApplicationEvent?
        if let draft {
            guard draft.category != nil, draft.applicationId != nil else {
                throw MailReviewError.incompleteDraft(messageId: messageId)
            }
            event = try data.confirmReview(
                messageId, category: draft.category, applicationId: .some(draft.applicationId),
                status: .some(draft.status), at: now
            )
        } else {
            guard previous.applicationId.flatMap({ data.application(id: $0) }) != nil else {
                throw MailReviewError.incompleteDraft(messageId: messageId)
            }
            event = try data.confirmReview(messageId, at: now)
        }
        recordWrite(messageId)
        reviewLaterIDs.removeAll { $0 == messageId }
        if self.draft?.messageId == messageId { self.draft = nil }
        recompute()

        let company = data.mailMessage(id: messageId)?.applicationId
            .flatMap { data.application(id: $0) }?.company ?? previous.extracted.company ?? previous.from.address
        let message: LocalizedStringResource = if let status = event?.toStatus {
            MailReviewStrings.confirmedMoved(company, to: status)
        } else {
            MailReviewStrings.confirmedLinked(company)
        }
        let eventId = event?.id
        return ToastItem(glyph: ToastGlyph.confirmed, message: message, action: .undo { [weak self] in
            guard let self else { return }
            if let eventId {
                guard (try? data.revertEvent(eventId, at: now)) != nil else { return }
            }
            restore(previous)
        })
    }

    /// "Not job mail": the email leaves every list (the server forgets it). Undo restores it.
    @discardableResult
    public func markNotJobMail(_ messageId: String) throws -> ToastItem {
        guard let previous = data.mailMessage(id: messageId) else {
            throw UserDataError.missingMailMessage(messageId)
        }
        try data.setReviewState(messageId, to: .dismissed, at: now)
        recordWrite(messageId)
        reviewLaterIDs.removeAll { $0 == messageId }
        if draft?.messageId == messageId { draft = nil }
        recompute()
        return ToastItem(glyph: ToastGlyph.hidden, message: MailReviewStrings.notJobMail, action: .undo { [weak self] in
            self?.restore(previous)
        })
    }

    /// Puts the email off: it stays pending and moves to the bottom of To review on this device.
    public func reviewLater(_ messageId: String) {
        guard data.mailMessage(id: messageId)?.reviewState == .pending else { return }
        reviewLaterIDs.removeAll { $0 == messageId }
        reviewLaterIDs.append(messageId)
        if draft?.messageId == messageId { draft = nil }
        recompute()
    }

    /// Undo on an Updates row: reverts the automatic move (core marks the email corrected), puts
    /// the email back in To review and opens its review sheet so the user can say what it was.
    /// No Undo on this toast (decisions.md D12: an undo is never undone from a toast).
    @discardableResult
    public func undoUpdate(_ eventId: String) throws -> ToastItem {
        guard let event = data.applicationEvents.first(where: { $0.id == eventId }) else {
            throw UserDataError.missingEvent(eventId)
        }
        let undo = try data.undoAutoChange(eventId, at: now)
        let messageId = event.evidence?.mailMessageId.flatMap { data.mailMessage(id: $0)?.id }
        if let messageId {
            try data.setReviewState(messageId, to: .pending, at: now)
        }
        recordWrite(messageId ?? eventId)
        recompute()
        if let messageId { beginReview(messageId) }

        let company = data.application(id: event.applicationId)?.company ?? ""
        let restored = undo.toStatus ?? event.fromStatus ?? .applied
        return ToastItem(glyph: ToastGlyph.restored, message: Strings.moved(company, to: restored))
    }

    /// Overflow "Mark all as seen": clears the Updates list on this device. Never touches To review.
    public func markAllUpdatesSeen() {
        seenUpdateIDs.formUnion(updates.map(\.id))
        recompute()
    }

    // MARK: Derivation

    private var filteredAccounts: [MailAccountItem] {
        guard let selectedAccountId else { return accounts }
        return accounts.filter { $0.id == selectedAccountId }
    }

    private func inScope(_ accountId: String?) -> Bool {
        guard let selectedAccountId else { return true }
        return accountId == selectedAccountId
    }

    /// Puts a message back to the value it had before an action (Undo).
    private func restore(_ message: MailMessage) {
        guard let index = data.mailMessages.firstIndex(where: { $0.id == message.id }) else { return }
        data.mailMessages[index] = message
        recordWrite(message.id)
        recompute()
    }

    private func recompute() {
        accounts = data.mailAccounts.map(MailAccountItem.init)
        if let selectedAccountId, !accounts.contains(where: { $0.id == selectedAccountId }) {
            self.selectedAccountId = nil
        }

        let queue = data.reviewQueue()
        let pendingIDs = Set(queue.map(\.id))
        reviewLaterIDs.removeAll { !pendingIDs.contains($0) }
        badgeCount = queue.count
        let scoped = queue.filter { inScope($0.accountId) }
        let later = reviewLaterIDs.compactMap { id in scoped.first { $0.id == id } }
        toReview = scoped.filter { !reviewLaterIDs.contains($0.id) } + later

        let since = calendar.date(byAdding: .day, value: -Self.updatesWindowDays, to: now) ?? now
        updates = data.autoChanges(since: since).filter { item in
            guard let messageId = item.mailMessageId, !seenUpdateIDs.contains(item.id) else { return false }
            return inScope(data.mailMessage(id: messageId)?.accountId)
        }

        let jobMail = data.mailMessages
            .filter { $0.category != .notJob && $0.reviewState != .dismissed && inScope($0.accountId) }
            .sorted { $0.receivedAt > $1.receivedAt }
        let alerts = jobMail.filter { $0.category == .jobAlert }
        var items = jobMail.filter { $0.category != .jobAlert }.map { MailListItem.message(row(for: $0)) }
        if let latest = alerts.first {
            var senders: [MailAddress] = []
            for alert in alerts where !senders.contains(where: { $0.address == alert.from.address }) {
                senders.append(alert.from)
            }
            items.append(.jobAlerts(JobAlertBundle(messageIds: alerts.map(\.id), senders: senders, latestReceivedAt: latest.receivedAt)))
            items.sort { $0.receivedAt > $1.receivedAt }
        }
        jobMailItems = items
        categoryCounts = Dictionary(grouping: jobMail, by: \.category).mapValues(\.count)
        counts = MailFilterCounts(toReview: toReview.count, updates: updates.count, allJobMail: items.count)

        applicationOptions = data.applications
            .map { ApplicationOption(id: $0.id, company: CompanyIdentity(name: $0.company, domain: $0.companyDomain), role: $0.role, status: $0.status) }
            .sorted {
                let order = $0.company.name.localizedStandardCompare($1.company.name)
                return order == .orderedSame ? $0.role.localizedStandardCompare($1.role) == .orderedAscending : order == .orderedAscending
            }
    }

    private func row(for message: MailMessage) -> MailRow {
        let application = message.applicationId.flatMap { data.application(id: $0) }
        return MailRow(
            id: message.id,
            accountId: message.accountId,
            category: message.category,
            sender: message.from,
            subject: message.subject,
            snippet: message.snippet,
            receivedAt: message.receivedAt,
            applicationId: application?.id,
            company: application.map { CompanyIdentity(name: $0.company, domain: $0.companyDomain) }
                ?? message.extracted.company.map { CompanyIdentity(name: $0) },
            role: application?.role ?? message.extracted.role,
            applicationStatus: application?.status,
            reviewState: message.reviewState,
            isPendingSync: pendingSyncIDs.contains(message.id)
        )
    }
}
