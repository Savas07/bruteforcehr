import BFHRCore
import Foundation

// The CV editor's ports to the outside world. BFHRUI never imports Firebase: the app target
// implements these with Firestore, Cloud Storage and callable Functions (apps/ios/BruteForceHR/
// CVCloud*.swift); tests use in-memory fakes. Write semantics are shared with the desktop
// (docs/adr/0009-cv-studio.md):
//
// - Every save is one batch: create `cvs/{id}/revisions/{rev}` + update `cvs/{id}` with
//   `version = previous + 1` (the rules reject anything else). No transactions, so saves work
//   offline and queue in Firestore's persistence.
// - A batch the server rejects because `version` moved on is a version conflict
//   (`CVWriteError.conflict`). The editor keeps its content, writes it as a revision of its own
//   (create-only is always allowed, so nothing is lost) and asks the user which version to keep.

/// Fields of a `cvs/{cvId}` update. `nil` leaves a field unchanged.
public struct CVChanges: Hashable, Sendable {
    public var title: String?
    public var currentRevisionId: String?
    public var templateId: String?
    public var theme: CvTheme?
    public var isDefault: Bool?
    /// `.some(nil)` unarchives.
    public var archivedAt: Date??
    public var updatedAt: Date

    public init(
        title: String? = nil, currentRevisionId: String? = nil, templateId: String? = nil, theme: CvTheme? = nil,
        isDefault: Bool? = nil, archivedAt: Date?? = nil, updatedAt: Date
    ) {
        self.title = title
        self.currentRevisionId = currentRevisionId
        self.templateId = templateId
        self.theme = theme
        self.isDefault = isDefault
        self.archivedAt = archivedAt
        self.updatedAt = updatedAt
    }

    /// The changes applied to a local copy of the CV (optimistic UI), version bumped.
    func applied(to cv: Cv) -> Cv {
        var cv = cv
        if let title { cv.title = title }
        if let currentRevisionId { cv.currentRevisionId = currentRevisionId }
        if let templateId { cv.templateId = templateId }
        if let theme { cv.theme = theme }
        if let isDefault { cv.isDefault = isDefault }
        if let archivedAt { cv.archivedAt = archivedAt }
        cv.updatedAt = updatedAt
        cv.version += 1
        return cv
    }
}

public enum CVWriteError: Error, Hashable, Sendable {
    /// The CV's `version` moved on since this device read it (another device saved).
    case conflict
    /// Anything else (rules, quota, malformed data). The editor offers Try again.
    case failed(String)
}

/// Writes CVs and revisions. Calls return when the server accepted the write; while offline they
/// stay suspended (the write is already in the local cache and survives a relaunch).
public protocol CVWriter: AnyObject {
    /// New ids for CVs and revisions (Firestore auto ids).
    func makeID() -> String
    /// A new CV (version 1) with its first revision.
    func create(_ cv: Cv, revision: CvRevision) async throws(CVWriteError)
    /// Updates a CV from `previousVersion` to `previousVersion + 1`, creating `revision` in the
    /// same batch when given.
    func update(cvId: String, previousVersion: Int, changes: CVChanges, revision: CvRevision?) async throws(CVWriteError)
    /// A revision on its own (the losing side of a conflict).
    func createRevision(_ revision: CvRevision) async throws(CVWriteError)
    /// Reads one revision (content of a CV that isn't open, e.g. to duplicate it from the list).
    func revision(cvId: String, revisionId: String) async throws -> CvRevision
}
