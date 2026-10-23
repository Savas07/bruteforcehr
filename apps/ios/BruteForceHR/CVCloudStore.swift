import BFHRCore
import BFHRUI
import FirebaseFirestore
import Foundation
import Network

/// The CVs area on Firestore (docs/adr/0002-data-model.md, docs/adr/0009-cv-studio.md):
/// snapshot listeners on `users/{uid}`, `users/{uid}/cvs` and the open CV's revisions (plus its
/// base CV's, for the variant banner) feed `CVEditorModel`; writes are batches through `CVWriter`.
/// Firestore's offline persistence is the outbox: writes made offline show at once, survive a
/// relaunch and sync when the device is back online (`hasPendingWrites` → "Saved on this device").
final class FirestoreCVStore: CVWriter {
    private let uid: String
    private let db: Firestore
    private weak var model: CVEditorModel?

    private var profileListener: (any ListenerRegistration)?
    private var cvsListener: (any ListenerRegistration)?
    private var revisionListeners: [String: any ListenerRegistration] = [:]
    private let pathMonitor = NWPathMonitor()

    private var profile: Profile?
    private var cvs: [Cv] = []
    private var revisions: [String: [CvRevision]] = [:]
    private var pendingCvs: Set<String> = []
    private var pendingRevisions: [String: Set<String>] = [:]
    private var receivedCvs = false
    private var lastServerSync: Date?

    init(uid: String, db: Firestore = .firestore()) {
        self.uid = uid
        self.db = db
    }

    deinit {
        profileListener?.remove()
        cvsListener?.remove()
        revisionListeners.values.forEach { $0.remove() }
        pathMonitor.cancel()
    }

    private var user: DocumentReference { db.collection("users").document(uid) }
    private var cvsCollection: CollectionReference { user.collection("cvs") }

    // MARK: Listening

    /// Starts the listeners and the connection monitor for `model`.
    func start(_ model: CVEditorModel) {
        self.model = model
        model.writer = self
        model.usesSystemClock = true
        model.phase = .loading

        profileListener = user.addSnapshotListener { [weak self] snapshot, _ in
            guard let self, let snapshot, snapshot.exists, let data = snapshot.data() else { return }
            profile = try? Self.decode(Profile.self, data, ids: ["id": snapshot.documentID])
            push()
        }
        cvsListener = cvsCollection.addSnapshotListener(includeMetadataChanges: true) { [weak self] snapshot, error in
            guard let self else { return }
            guard let snapshot else {
                if !receivedCvs, let error { model.phase = .failed(Self.loadFailure(error)) }
                return
            }
            receivedCvs = true
            if !snapshot.metadata.isFromCache { lastServerSync = .now }
            cvs = snapshot.documents.compactMap { document in
                try? Self.decode(Cv.self, document.data(), ids: ["id": document.documentID])
            }
            pendingCvs = Set(snapshot.documents.filter(\.metadata.hasPendingWrites).map(\.documentID))
            push()
        }

        pathMonitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            Task { @MainActor in self?.connectionChanged(online: online) }
        }
        pathMonitor.start(queue: .main)
    }

    private func connectionChanged(online: Bool) {
        guard let model else { return }
        if online {
            model.connection = .online
        } else if !model.connection.isOffline {
            model.connection = .offline(lastSyncedAt: lastServerSync)
        }
    }

    /// Listens to the revisions of the open CV and of its base (variant banner); stops the others.
    func watchRevisions(of cvId: String?) {
        var wanted: Set<String> = []
        if let cvId {
            wanted.insert(cvId)
            if let parent = cvs.first(where: { $0.id == cvId })?.parentCvId { wanted.insert(parent) }
        }
        for (id, listener) in revisionListeners where !wanted.contains(id) {
            listener.remove()
            revisionListeners[id] = nil
            revisions[id] = nil
            pendingRevisions[id] = nil
        }
        for id in wanted where revisionListeners[id] == nil {
            revisionListeners[id] = cvsCollection.document(id).collection("revisions")
                .addSnapshotListener(includeMetadataChanges: true) { [weak self] snapshot, _ in
                    guard let self, let snapshot else { return }
                    revisions[id] = snapshot.documents.compactMap { document in
                        try? Self.decode(CvRevision.self, document.data(), ids: ["id": document.documentID, "cvId": id])
                    }
                    pendingRevisions[id] = Set(snapshot.documents.filter(\.metadata.hasPendingWrites).map(\.documentID))
                    push()
                }
        }
        push()
    }

    private func push() {
        guard let model, receivedCvs else { return }
        model.load(UserData(profile: profile, cvs: cvs, cvRevisions: revisions.values.flatMap { $0 }))
        var pending = pendingCvs
        for (cvId, ids) in pendingRevisions where !ids.isEmpty { pending.insert(cvId) }
        model.pendingSyncIDs = pending
    }

    // MARK: CVWriter

    func makeID() -> String { cvsCollection.document().documentID }

    func create(_ cv: Cv, revision: CvRevision) async throws(CVWriteError) {
        let batch = db.batch()
        do {
            batch.setData(try Self.encode(revision, dropping: ["id", "cvId"]), forDocument: revisionRef(revision))
            batch.setData(try Self.encode(cv, dropping: ["id"]), forDocument: cvsCollection.document(cv.id))
        } catch {
            throw .failed(String(describing: error))
        }
        try await commit(batch, isUpdate: false)
    }

    func update(cvId: String, previousVersion: Int, changes: CVChanges, revision: CvRevision?) async throws(CVWriteError) {
        let batch = db.batch()
        do {
            if let revision {
                batch.setData(try Self.encode(revision, dropping: ["id", "cvId"]), forDocument: revisionRef(revision))
            }
            batch.updateData(try Self.fields(changes, previousVersion: previousVersion), forDocument: cvsCollection.document(cvId))
        } catch {
            throw .failed(String(describing: error))
        }
        try await commit(batch, isUpdate: true)
    }

    func createRevision(_ revision: CvRevision) async throws(CVWriteError) {
        let batch = db.batch()
        do {
            batch.setData(try Self.encode(revision, dropping: ["id", "cvId"]), forDocument: revisionRef(revision))
        } catch {
            throw .failed(String(describing: error))
        }
        try await commit(batch, isUpdate: false)
    }

    func revision(cvId: String, revisionId: String) async throws -> CvRevision {
        let snapshot = try await cvsCollection.document(cvId).collection("revisions").document(revisionId).getDocument()
        guard let data = snapshot.data() else { throw CVWriteError.failed("Revision \(revisionId) not found") }
        return try Self.decode(CvRevision.self, data, ids: ["id": revisionId, "cvId": cvId])
    }

    private func revisionRef(_ revision: CvRevision) -> DocumentReference {
        cvsCollection.document(revision.cvId).collection("revisions").document(revision.id)
    }

    /// Commits; for CV updates the rules' only possible refusal for the owner is the version step,
    /// so permission-denied there is a version conflict.
    private func commit(_ batch: WriteBatch, isUpdate: Bool) async throws(CVWriteError) {
        do {
            try await batch.commit()
        } catch {
            let nsError = error as NSError
            if isUpdate, nsError.domain == FirestoreErrorDomain, nsError.code == FirestoreErrorCode.permissionDenied.rawValue {
                throw .conflict
            }
            throw .failed(nsError.localizedDescription)
        }
    }

    // MARK: Mapping (converters of @bfhr/api, in Swift)

    /// Document data → model: path ids injected, `Timestamp`s → `Date` (Firestore.Decoder),
    /// unknown fields (and `schemaVersion`) ignored.
    static func decode<T: Decodable>(_ type: T.Type, _ data: [String: Any], ids: [String: String]) throws -> T {
        var data = data
        for (key, value) in ids { data[key] = value }
        guard let version = data["schemaVersion"] as? Int, version >= 1 else {
            throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "invalid schemaVersion"))
        }
        return try Firestore.Decoder().decode(type, from: data)
    }

    /// Model → document data for a create: path ids removed, `Date`s → `Timestamp`s, nil → null,
    /// `schemaVersion` stamped.
    static func encode<T: Encodable>(_ value: T, dropping pathKeys: [String]) throws -> [String: Any] {
        var data = try Firestore.Encoder().encode(value)
        for key in pathKeys { data[key] = nil }
        data["schemaVersion"] = 1
        return data
    }

    /// `converters.cvUpdate`: the changed fields plus `version = previous + 1`.
    static func fields(_ changes: CVChanges, previousVersion: Int) throws -> [String: Any] {
        var data: [String: Any] = [
            "updatedAt": Timestamp(date: changes.updatedAt),
            "version": previousVersion + 1,
        ]
        if let title = changes.title { data["title"] = title }
        if let id = changes.currentRevisionId { data["currentRevisionId"] = id }
        if let templateId = changes.templateId { data["templateId"] = templateId }
        if let theme = changes.theme { data["theme"] = try Firestore.Encoder().encode(theme) }
        if let isDefault = changes.isDefault { data["isDefault"] = isDefault }
        if let archivedAt = changes.archivedAt { data["archivedAt"] = archivedAt.map { Timestamp(date: $0) } ?? NSNull() }
        return data
    }

    static func loadFailure(_ error: any Error) -> LoadFailure {
        let nsError = error as NSError
        let kind: LoadFailure.Kind = switch FirestoreErrorCode.Code(rawValue: nsError.code) {
        case .permissionDenied, .unauthenticated: .permission
        case .unavailable, .deadlineExceeded: .network
        default: .unknown
        }
        return LoadFailure(kind, details: "\(nsError.domain) \(nsError.code): \(nsError.localizedDescription)")
    }
}
