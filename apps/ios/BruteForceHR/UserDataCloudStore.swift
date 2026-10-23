import BFHRCore
import BFHRUI
import FirebaseFirestore
import Foundation
import Network

/// Today and the Tracker on Firestore (M3, docs/adr/0002-data-model.md): snapshot listeners on
/// `users/{uid}` and its `applications`, `applicationEvents`, `interviews`, `contacts`, `cvs` and
/// `coverLetters` (titles for the Documents section) feed one `UserData` to both screen models;
/// their optimistic mutations come back as `UserDataChanges` and are written as one batch each
/// (`UserDataWriter`). Firestore's offline persistence is the outbox: offline writes show at once
/// (`hasPendingWrites` → `SyncGlyph`), survive a relaunch and sync when the device is back online.
/// Jobs, matches and mail are read from M4 / M5, when the server starts writing them.
final class FirestoreUserDataStore: UserDataWriter {
    private let uid: String
    private let db: Firestore
    private var models: [any ScreenModel] = []

    private let registrations = Registrations()

    private var profile: Profile?
    private var applications: [Application] = []
    private var events: [ApplicationEvent] = []
    private var interviews: [Interview] = []
    private var contacts: [Contact] = []
    private var cvs: [Cv] = []
    private var coverLetters: [CoverLetter] = []
    private var pending: [String: Set<String>] = [:]
    private var received: Set<String> = []
    private var lastServerSync: Date?

    /// The collections that must arrive before the screens leave the skeleton.
    private static let required: Set<String> = ["applications", "applicationEvents", "interviews", "contacts"]

    init(uid: String, db: Firestore = .firestore()) {
        self.uid = uid
        self.db = db
    }

    /// Listener handles and the path monitor; `remove()` and `cancel()` are thread-safe, so the
    /// nonisolated deinit may call them.
    private nonisolated final class Registrations: @unchecked Sendable {
        var listeners: [any ListenerRegistration] = []
        let pathMonitor = NWPathMonitor()

        deinit {
            listeners.forEach { $0.remove() }
            pathMonitor.cancel()
        }
    }

    private var user: DocumentReference { db.collection("users").document(uid) }

    // MARK: Listening

    /// Starts the listeners and the connection monitor for `models`.
    func start(_ models: [any ScreenModel]) {
        self.models = models
        for model in models { model.phase = .loading }

        registrations.listeners.append(user.addSnapshotListener { [weak self] snapshot, _ in
            guard let self, let snapshot, snapshot.exists, let data = snapshot.data() else { return }
            profile = try? Self.decode(Profile.self, data, ids: ["id": snapshot.documentID])
            push()
        })
        listen("applications") { [weak self] documents in
            self?.applications = documents.compactMap { try? Self.decode(Application.self, $0.data(), ids: ["id": $0.documentID]) }
        }
        listen("applicationEvents", pendingKey: "applicationId") { [weak self] documents in
            self?.events = documents.compactMap { try? Self.decode(ApplicationEvent.self, $0.data(), ids: ["id": $0.documentID]) }
        }
        listen("interviews") { [weak self] documents in
            self?.interviews = documents.compactMap { try? Self.decode(Interview.self, $0.data(), ids: ["id": $0.documentID]) }
        }
        listen("contacts") { [weak self] documents in
            self?.contacts = documents.compactMap { try? Self.decode(Contact.self, $0.data(), ids: ["id": $0.documentID]) }
        }
        listen("cvs") { [weak self] documents in
            self?.cvs = documents.compactMap { try? Self.decode(Cv.self, $0.data(), ids: ["id": $0.documentID]) }
        }
        listen("coverLetters") { [weak self] documents in
            self?.coverLetters = documents.compactMap { try? Self.decode(CoverLetter.self, $0.data(), ids: ["id": $0.documentID]) }
        }

        registrations.pathMonitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            Task { @MainActor in self?.connectionChanged(online: online) }
        }
        registrations.pathMonitor.start(queue: .main)
    }

    /// One collection listener with metadata changes, so pending writes show as `SyncGlyph`.
    /// `pendingKey` names the field that identifies the row a pending document belongs to (an
    /// event marks its application); the document id otherwise.
    private func listen(_ collection: String, pendingKey: String? = nil, apply: @escaping ([QueryDocumentSnapshot]) -> Void) {
        registrations.listeners.append(user.collection(collection).addSnapshotListener(includeMetadataChanges: true) { [weak self] snapshot, error in
            guard let self else { return }
            guard let snapshot else {
                if Self.required.contains(collection), !received.contains(collection), let error {
                    for model in models { model.phase = .failed(Self.loadFailure(error)) }
                }
                return
            }
            received.insert(collection)
            if !snapshot.metadata.isFromCache { lastServerSync = .now }
            apply(snapshot.documents)
            pending[collection] = Set(snapshot.documents.filter(\.metadata.hasPendingWrites).map { document in
                pendingKey.flatMap { document.data()[$0] as? String } ?? document.documentID
            })
            push()
        })
    }

    private func connectionChanged(online: Bool) {
        for model in models {
            if online {
                model.connection = .online
            } else if !model.connection.isOffline {
                model.connection = .offline(lastSyncedAt: lastServerSync)
            }
        }
    }

    private func push() {
        guard Self.required.isSubset(of: received) else { return }
        let data = UserData(
            profile: profile,
            cvs: cvs,
            coverLetters: coverLetters,
            applications: applications,
            applicationEvents: events,
            interviews: interviews,
            contacts: contacts
        )
        let pendingIDs = pending.values.reduce(into: Set<String>()) { $0.formUnion($1) }
        for model in models {
            model.load(data)
            model.pendingSyncIDs = pendingIDs
        }
    }

    // MARK: UserDataWriter

    /// One batch: creates are full documents (`schemaVersion` stamped), updates only the fields
    /// that changed (so an older build never drops a field it doesn't know), deletes by id.
    /// Mail messages and job matches only carry the fields clients may write.
    func commit(_ changes: UserDataChanges) async throws {
        let batch = db.batch()
        for change in changes.applications { try write(change, in: "applications", batch) }
        for event in changes.applicationEvents {
            batch.setData(try Self.encode(event, dropping: ["id"]), forDocument: user.collection("applicationEvents").document(event.id))
        }
        for change in changes.interviews { try write(change, in: "interviews", batch) }
        for change in changes.contacts { try write(change, in: "contacts", batch) }
        for case .updated(let before, let after) in changes.mailMessages where Self.clientReviewStates.contains(after.reviewState) {
            let fields = try Self.changedFields(before, after).filter { Self.mailMessageFields.contains($0.key) }
            if !fields.isEmpty { batch.updateData(fields, forDocument: user.collection("mailMessages").document(after.id)) }
        }
        for case .updated(let before, let after) in changes.jobMatches {
            let fields = try Self.changedFields(before, after).filter { Self.jobMatchFields.contains($0.key) }
            if !fields.isEmpty { batch.updateData(fields, forDocument: user.collection("jobMatches").document(after.id)) }
        }
        try await batch.commit()
    }

    private func write<Document: Encodable & Identifiable>(
        _ change: BFHRUI.DocumentChange<Document>, in collection: String, _ batch: WriteBatch
    ) throws where Document.ID == String {
        let documents = user.collection(collection)
        switch change {
        case .created(let document):
            batch.setData(try Self.encode(document, dropping: ["id"]), forDocument: documents.document(document.id))
        case .updated(let before, let after):
            let fields = try Self.changedFields(before, after)
            if !fields.isEmpty { batch.updateData(fields, forDocument: documents.document(after.id)) }
        case .deleted(let document):
            batch.deleteDocument(documents.document(document.id))
        }
    }

    /// `MAIL_MESSAGE_CLIENT_UPDATABLE_FIELDS`, `MAIL_REVIEW_CLIENT_STATES` and
    /// `JOB_MATCH_CLIENT_UPDATABLE_FIELDS` of @bfhr/core (mirrored by the rules).
    private static let mailMessageFields: Set<String> = ["reviewState", "applicationId", "category", "reviewedAt"]
    private static let clientReviewStates: Set<ReviewState> = [.confirmed, .corrected, .dismissed]
    private static let jobMatchFields: Set<String> = ["state", "dismissReasons", "stateChangedAt"]

    // MARK: Mapping (converters of @bfhr/api, in Swift)

    /// Document data → model: path ids injected, `Timestamp`s → `Date`, unknown fields (and
    /// `schemaVersion`) ignored.
    static func decode<T: Decodable>(_ type: T.Type, _ data: [String: Any], ids: [String: String]) throws -> T {
        try FirestoreCVStore.decode(type, data, ids: ids)
    }

    /// Model → document data for a create: path ids removed, `schemaVersion` stamped.
    static func encode<T: Encodable>(_ value: T, dropping pathKeys: [String]) throws -> [String: Any] {
        try FirestoreCVStore.encode(value, dropping: pathKeys)
    }

    /// `toFirestoreUpdate`: the top-level fields whose encoded value differs (`id` excluded).
    static func changedFields<T: Encodable>(_ before: T, _ after: T) throws -> [String: Any] {
        let old = try Firestore.Encoder().encode(before)
        let new = try Firestore.Encoder().encode(after)
        var fields: [String: Any] = [:]
        for (key, value) in new where key != "id" {
            if let previous = old[key], (previous as AnyObject).isEqual(value) { continue }
            fields[key] = value
        }
        return fields
    }

    static func loadFailure(_ error: any Error) -> LoadFailure {
        FirestoreCVStore.loadFailure(error)
    }
}
