import BFHRCore
import Foundation

// The bridge from optimistic `UserData` mutations to the data layer. A screen model mutates its
// copy at once (the screen updates without waiting), then hands the documents that changed to its
// `UserDataWriter`, which writes them as one atomic batch (docs/adr/0002-data-model.md: a status
// move is the application update plus its event; an Undo is a new reverting event). Firestore's
// offline persistence queues the batch while offline and the snapshot listeners deliver the
// result, so a refused write comes back as the server's state.

/// One document that changed between two `UserData` values.
public enum DocumentChange<Document: Identifiable & Hashable & Sendable>: Hashable, Sendable where Document.ID == String {
    case created(Document)
    case updated(before: Document, after: Document)
    case deleted(Document)

    public var id: String {
        switch self {
        case .created(let document), .deleted(let document): document.id
        case .updated(_, let after): after.id
        }
    }
}

/// The documents a mutation touched, per collection. Events are append-only, so only creates are
/// carried; mail messages and job matches only ever change, the server creates them.
public struct UserDataChanges: Hashable, Sendable {
    public var applications: [DocumentChange<Application>] = []
    public var applicationEvents: [ApplicationEvent] = []
    public var interviews: [DocumentChange<Interview>] = []
    public var contacts: [DocumentChange<Contact>] = []
    public var mailMessages: [DocumentChange<MailMessage>] = []
    public var jobMatches: [DocumentChange<JobMatch>] = []

    public init() {}

    /// The changes that turn `before` into `after`.
    public init(from before: UserData, to after: UserData) {
        applications = Self.diff(before.applications, after.applications)
        let knownEvents = Set(before.applicationEvents.map(\.id))
        applicationEvents = after.applicationEvents.filter { !knownEvents.contains($0.id) }
        interviews = Self.diff(before.interviews, after.interviews)
        contacts = Self.diff(before.contacts, after.contacts)
        mailMessages = Self.diff(before.mailMessages, after.mailMessages).filter {
            if case .updated = $0 { true } else { false }
        }
        jobMatches = Self.diff(before.jobMatches, after.jobMatches).filter {
            if case .updated = $0 { true } else { false }
        }
    }

    public var isEmpty: Bool {
        applications.isEmpty && applicationEvents.isEmpty && interviews.isEmpty && contacts.isEmpty
            && mailMessages.isEmpty && jobMatches.isEmpty
    }

    /// Ids of every touched document (the rows that show `SyncGlyph` until the write lands).
    public var touchedIDs: Set<String> {
        var ids = Set(applications.map(\.id))
        ids.formUnion(applicationEvents.map(\.applicationId))
        ids.formUnion(interviews.map(\.id))
        ids.formUnion(contacts.map(\.id))
        ids.formUnion(mailMessages.map(\.id))
        ids.formUnion(jobMatches.map(\.id))
        return ids
    }

    private static func diff<Document: Identifiable & Hashable & Sendable>(
        _ before: [Document], _ after: [Document]
    ) -> [DocumentChange<Document>] where Document.ID == String {
        let old = Dictionary(before.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let new = Set(after.map(\.id))
        var changes: [DocumentChange<Document>] = []
        for document in after {
            if let previous = old[document.id] {
                if previous != document { changes.append(.updated(before: previous, after: document)) }
            } else {
                changes.append(.created(document))
            }
        }
        for document in before where !new.contains(document.id) {
            changes.append(.deleted(document))
        }
        return changes
    }
}

/// Persists screen-model mutations (the app's Firestore store; nil in tests and design mode).
public protocol UserDataWriter: AnyObject {
    /// Writes `changes` as one atomic batch. Throws when the server refused it.
    func commit(_ changes: UserDataChanges) async throws
}

extension UserData {
    /// A new document id in Firestore's auto-id format (20 characters from [A-Za-z0-9]), so the
    /// optimistic copy and the stored document share it.
    public static func makeID() -> String {
        let alphabet = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")
        var generator = SystemRandomNumberGenerator()
        return String((0..<20).map { _ in alphabet[Int(generator.next(upperBound: UInt(alphabet.count)))] })
    }
}
