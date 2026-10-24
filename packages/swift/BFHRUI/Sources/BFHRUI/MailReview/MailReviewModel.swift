import BFHRCore
import Foundation
import Observation

/// The Mail tab (docs/design/research/mail-review.md, "Decision — iOS"): the To review queue,
/// automatic Updates of the last 14 days and All job mail, filtered by account, plus the review
/// sheet's editable draft and the read-only email sheet.
///
/// Decisions follow the deployed review trigger (ADR 0012): the client writes only the four review
/// fields and the server links, records and moves. The data layer holds review writes for the
/// toast's Undo window, so Undo inside it never reaches the server; after that, a move is undone
/// from the timeline or Updates (a reverting event).
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

    /// Persists every decision (the app's Firestore store); nil in tests and design mode.
    public weak var writer: (any UserDataWriter)?
    /// Live data: writes are stamped with the system clock.
    public var usesSystemClock = false
    /// Counts writes the server refused; the screen shows a toast when it changes.
    public private(set) var writeFailures = 0

    var writeTime: Date { usesSystemClock ? .now : now }

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

    /// Filtered accounts still running their first lookback scan (the scanning card).
    public var scanning: [MailAccountItem] { filteredAccounts.filter(\.isScanning) }

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

    /// The draft differs from the email's proposal: Confirm writes a correction.
    public var isDraftEdited: Bool {
        guard let draft, let message = data.mailMessage(id: draft.messageId) else { return false }
        return draft != initialDraft(for: message)
    }

    /// The open email as the review sheet shows it: the proposal with the draft's corrections
    /// applied (category, application, and the move the server makes for them), so the sentence,
    /// the fields and Confirm's enabled state always describe what Confirm will do. A corrected
    /// field is the user's, so it's no longer hedged.
    public var draftProposal: ReviewProposal? {
        guard let draft, var proposal = reviewing, let message = data.mailMessage(id: draft.messageId) else { return nil }
        guard isDraftEdited else { return proposal }
        if let category = draft.category { proposal.category = category }
        let application = draft.applicationId.flatMap { data.application(id: $0) }
        proposal.applicationId = application?.id
        proposal.company = application.map { CompanyIdentity(name: $0.company, domain: $0.companyDomain) } ?? proposal.company
        proposal.role = application?.role ?? proposal.role
        proposal.currentStatus = application?.status
        proposal.proposedStatus = data.reviewMove(for: message, category: draft.category ?? message.category, applicationId: application?.id)
        if proposal.category != .interviewInvite { proposal.interviewSuggestion = nil }
        proposal.isHedged = false
        return proposal
    }

    // MARK: Email sheet

    /// The email open in the read-only sheet (All job mail, a timeline row, a link); nil when closed.
    public var viewingId: String?

    /// The open email with its application and the interview it suggests.
    public var viewing: MailMessageDetail? {
        viewingId.flatMap { data.mailMessage(id: $0) }.map(data.messageDetail)
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
        // A sheet whose email went away (disconnected account, Not job mail elsewhere) closes.
        if let messageId = draft?.messageId, data.mailMessage(id: messageId)?.reviewState != .pending { draft = nil }
        if let viewingId, data.mailMessage(id: viewingId) == nil { self.viewingId = nil }
    }

    /// Runs a mutation on `data`, recomputes and hands the changed documents to `writer` as one
    /// batch (see `TrackerBoardModel.mutate`).
    @discardableResult
    func mutate<Result>(_ body: (inout UserData) throws -> Result) rethrows -> Result {
        let before = data
        let result = try body(&data)
        let changes = UserDataChanges(from: before, to: data)
        recompute()
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

    // MARK: Opening

    /// Opens an email from a link (`bruteforcehr://mail/review/{id}`, a timeline row): the review
    /// sheet while it waits for review, the read-only email otherwise. False when it's gone.
    @discardableResult
    public func open(_ messageId: String) -> Bool {
        guard let message = data.mailMessage(id: messageId) else { return false }
        if message.reviewState == .pending, message.category != .jobAlert {
            viewingId = nil
            beginReview(messageId)
        } else {
            draft = nil
            viewingId = messageId
        }
        return true
    }

    // MARK: Review sheet

    /// Opens the review sheet for `messageId` with the email's proposal as the draft.
    @discardableResult
    public func beginReview(_ messageId: String) -> ReviewDraft? {
        guard let message = data.mailMessage(id: messageId) else { return nil }
        draft = initialDraft(for: message)
        return draft
    }

    public func endReview() { draft = nil }

    /// Confirm in the review sheet: the proposal as is, or the draft when the user changed a field
    /// (a correction, stored as a labeled example).
    @discardableResult
    public func confirmDraft() throws -> ToastItem {
        guard let draft else { throw MailReviewError.noOpenReview }
        return try confirm(draft.messageId, draft: isDraftEdited ? draft : nil)
    }

    private func initialDraft(for message: MailMessage) -> ReviewDraft {
        ReviewDraft(
            messageId: message.id,
            category: message.category == .notJob ? nil : message.category,
            applicationId: message.applicationId.flatMap { data.application(id: $0) }?.id
        )
    }

    /// The category and the application are set (the move follows from them).
    public func canConfirm(_ draft: ReviewDraft) -> Bool {
        draft.category != nil && draft.applicationId.flatMap { data.application(id: $0) } != nil
    }

    // MARK: Actions

    /// Confirms the email's proposal, or the sheet's corrected `draft`. The server links the email
    /// and makes the move; Undo (inside the toast's window) puts the email back in To review.
    @discardableResult
    public func confirm(_ messageId: String, draft: ReviewDraft? = nil) throws -> ToastItem {
        guard let previous = data.mailMessage(id: messageId) else {
            throw UserDataError.missingMailMessage(messageId)
        }
        let decision: ReviewDecision
        if let draft {
            guard let category = draft.category, let applicationId = draft.applicationId else {
                throw MailReviewError.incompleteDraft(messageId: messageId)
            }
            decision = .correct(category: category, applicationId: applicationId)
        } else {
            guard previous.applicationId.flatMap({ data.application(id: $0) }) != nil else {
                throw MailReviewError.incompleteDraft(messageId: messageId)
            }
            decision = .confirm
        }
        let move = try mutate { try $0.review(messageId, decision, at: writeTime) }
        recordWrite(messageId)
        reviewLaterIDs.removeAll { $0 == messageId }
        if self.draft?.messageId == messageId { self.draft = nil }
        recompute()

        let company = data.mailMessage(id: messageId)?.applicationId
            .flatMap { data.application(id: $0) }?.company ?? previous.extracted.company ?? previous.from.address
        let message: LocalizedStringResource = if let move {
            MailReviewStrings.confirmedMoved(company, to: move)
        } else {
            MailReviewStrings.confirmedLinked(company)
        }
        return ToastItem(glyph: ToastGlyph.confirmed, message: message, action: .undo { [weak self] in
            self?.restore(previous)
        })
    }

    /// "Not job mail": the email leaves every list (the server forgets it). Undo restores it.
    @discardableResult
    public func markNotJobMail(_ messageId: String) throws -> ToastItem {
        guard let previous = data.mailMessage(id: messageId) else {
            throw UserDataError.missingMailMessage(messageId)
        }
        try mutate { try $0.review(messageId, .notJobMail, at: writeTime) }
        recordWrite(messageId)
        reviewLaterIDs.removeAll { $0 == messageId }
        if draft?.messageId == messageId { draft = nil }
        if viewingId == messageId { viewingId = nil }
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

    /// Undo on an Updates row: reverts the automatic move and marks the email corrected (ADR
    /// 0002). No Undo on this toast (decisions.md D12: an undo is never undone from a toast).
    @discardableResult
    public func undoUpdate(_ eventId: String) throws -> ToastItem {
        guard let event = data.applicationEvents.first(where: { $0.id == eventId }) else {
            throw UserDataError.missingEvent(eventId)
        }
        let undo = try mutate { try $0.undoAutoChange(eventId, at: writeTime) }
        recordWrite(event.evidence?.mailMessageId ?? eventId)
        recompute()
        let company = data.application(id: event.applicationId)?.company ?? ""
        let restored = undo.toStatus ?? event.fromStatus ?? .applied
        return ToastItem(glyph: ToastGlyph.restored, message: Strings.moved(company, to: restored))
    }

    /// "Add interview" on an automatically applied invite: the server puts the suggested interview
    /// on the calendar. Undo (inside the toast's window) leaves it off.
    @discardableResult
    public func addInterview(_ messageId: String) throws -> ToastItem {
        guard let previous = data.mailMessage(id: messageId), UserData.pendingInterview(previous) != nil,
              previous.reviewState == .autoApplied else {
            throw UserDataError.missingMailMessage(messageId)
        }
        try mutate { try $0.confirmAutoApplied(messageId, at: writeTime) }
        recordWrite(messageId)
        let company = previous.applicationId.flatMap { data.application(id: $0) }?.company ?? previous.extracted.company ?? previous.from.address
        return ToastItem(glyph: ToastGlyph.confirmed, message: MailReviewStrings.interviewAdded(company), action: .undo { [weak self] in
            self?.restore(previous)
        })
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

    /// Puts a message back to the value it had before an action (Undo); the data layer drops the
    /// held write instead of sending it.
    private func restore(_ message: MailMessage) {
        mutate { data in
            guard let index = data.mailMessages.firstIndex(where: { $0.id == message.id }) else { return }
            data.mailMessages[index] = message
        }
        recordWrite(message.id)
    }

    private func recompute() {
        accounts = data.mailAccounts.filter { $0.status != .disconnected }.map(MailAccountItem.init)
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
