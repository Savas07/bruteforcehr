import BFHRCore
import Foundation

// Row and sheet data for the Mail tab (docs/design/research/mail-review.md, "Decision — iOS").
// Shared rows (`ReviewProposal`, `AutoChangeItem`, `MoveTarget`) come from Foundation/SharedItems.

/// The active filter chip. One is active at a time.
public enum MailFilter: Hashable, Sendable {
    /// The review queue. Default whenever it has items.
    case toReview
    /// Changes applied automatically from email in the last 14 days.
    case updates
    /// Every stored job email, newest first; `category` is the "Category ▾" chip (nil: all).
    case allJobMail(category: MailCategory? = nil)

    /// The chip this filter highlights (a category narrows All job mail, it isn't its own list).
    public var chip: Chip {
        switch self {
        case .toReview: .toReview
        case .updates: .updates
        case .allJobMail: .allJobMail
        }
    }

    public enum Chip: Hashable, Sendable, CaseIterable {
        case toReview
        case updates
        case allJobMail
    }
}

/// Item counts for the chips (account-filtered).
public struct MailFilterCounts: Hashable, Sendable {
    public var toReview: Int
    public var updates: Int
    /// Rows in All job mail without a category (the job-alert bundle counts once).
    public var allJobMail: Int

    public init(toReview: Int = 0, updates: Int = 0, allJobMail: Int = 0) {
        self.toReview = toReview
        self.updates = updates
        self.allJobMail = allJobMail
    }
}

/// A connected mailbox (client read-only status) for the title menu, the sync line and the
/// Reconnect banner.
public struct MailAccountItem: Identifiable, Hashable, Sendable {
    public var id: String
    public var address: String
    public var displayName: String?
    public var provider: MailProvider
    public var status: MailAccountStatus
    public var lastSyncedAt: Date?

    /// Needs sign-in or failed: the non-dismissible Reconnect banner.
    public var needsAttention: Bool { status == .needsReauth || status == .error }

    init(_ account: MailAccount) {
        id = account.id
        address = account.address
        displayName = account.displayName
        provider = account.provider
        status = account.status
        lastSyncedAt = account.lastSyncedAt
    }
}

/// One email in All job mail.
public struct MailRow: Identifiable, Hashable, Sendable {
    /// The mail message id.
    public var id: String
    public var accountId: String
    public var category: MailCategory
    public var sender: MailAddress
    public var subject: String
    public var snippet: String
    public var receivedAt: Date
    /// The linked application, if any.
    public var applicationId: String?
    public var company: CompanyIdentity?
    public var role: String?
    public var applicationStatus: ApplicationStatus?
    /// Confirmed / corrected / automatic / pending: the quiet chip on the row.
    public var reviewState: ReviewState
    /// Changed while offline and not synced yet (`SyncGlyph`).
    public var isPendingSync: Bool
}

/// The `job_alert` emails collapsed into one row ("Job alerts · 12 new postings sent to Jobs").
public struct JobAlertBundle: Hashable, Sendable {
    /// Newest first.
    public var messageIds: [String]
    /// Distinct senders, newest first (inline avatars).
    public var senders: [MailAddress]
    public var latestReceivedAt: Date

    public var count: Int { messageIds.count }
}

/// A row of All job mail.
public enum MailListItem: Identifiable, Hashable, Sendable {
    case message(MailRow)
    case jobAlerts(JobAlertBundle)

    public static let jobAlertsID = "job-alerts"

    public var id: String {
        switch self {
        case .message(let row): row.id
        case .jobAlerts: Self.jobAlertsID
        }
    }

    public var receivedAt: Date {
        switch self {
        case .message(let row): row.receivedAt
        case .jobAlerts(let bundle): bundle.latestReceivedAt
        }
    }
}

/// The review sheet's three editable fields (Category, Application, Status change). Starts from
/// the email's proposal; any edit makes Confirm a correction.
public struct ReviewDraft: Identifiable, Hashable, Sendable {
    public let messageId: String
    /// nil: "Select category" (Confirm disabled).
    public var category: MailCategory?
    /// nil: "No application found" with Link to application… / Create application (Confirm disabled).
    public var applicationId: String?
    /// The proposed status; nil or the application's current status files the email without a move.
    public var status: ApplicationStatus?

    public var id: String { messageId }

    public init(messageId: String, category: MailCategory?, applicationId: String?, status: ApplicationStatus?) {
        self.messageId = messageId
        self.category = category
        self.applicationId = applicationId
        self.status = status
    }
}

/// One choice in the review sheet's application picker ("Create application" is the view's).
public struct ApplicationOption: Identifiable, Hashable, Sendable {
    public var id: String
    public var company: CompanyIdentity
    public var role: String
    public var status: ApplicationStatus
}

public enum MailReviewError: Error, Hashable {
    /// Confirm was asked for without a category or an application.
    case incompleteDraft(messageId: String)
}
