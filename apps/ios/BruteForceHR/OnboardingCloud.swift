import BFHRCore
import BFHRUI
import FirebaseFirestore
import FirebaseFunctions
import Foundation
import Observation

/// First-run onboarding on Firestore (BRIEF M6): `users/{uid}` (created when missing, then
/// changed fields like Settings' writes), the first `savedSearches` documents and the
/// `jobMatchesRefresh` callable. A write applies locally at once; `save` returns when the server
/// has every pending write, so `jobMatchesRefresh` scores against the new profile.
final class FirestoreOnboardingService: OnboardingService {
    private let uid: String
    private let db: Firestore

    init(uid: String, db: Firestore = .firestore()) {
        self.uid = uid
        self.db = db
    }

    private var user: DocumentReference { db.collection("users").document(uid) }

    func save(profile: Profile, previous: Profile?, savedSearches: [SavedSearch]) async throws {
        let batch = db.batch()
        var writes = 0
        if let previous {
            let fields = try FirestoreUserDataStore.profileFields(previous, profile)
            if !fields.isEmpty {
                batch.updateData(fields, forDocument: user)
                writes += 1
            }
        } else {
            batch.setData(try FirestoreUserDataStore.encode(profile, dropping: ["id"]), forDocument: user)
            writes += 1
        }
        for savedSearch in savedSearches {
            batch.setData(try FirestoreUserDataStore.encode(savedSearch, dropping: ["id"]),
                          forDocument: user.collection("savedSearches").document(savedSearch.id))
            writes += 1
        }
        if writes > 0 { try await batch.commit() }
        // Earlier fire-and-forget writes (the preferences) reach the server first too.
        try await db.waitForPendingWrites()
    }

    func refreshMatches() async throws {
        _ = try await CVCallables.functions.httpsCallable("jobMatchesRefresh").call([String: Any]())
    }
}

/// Whether this session shows onboarding: decided only once `users/{uid}` has been seen (a
/// missing document only from the server, never from an empty cache), so a returning user never
/// sees it flash.
@MainActor
@Observable
final class OnboardingGate {
    enum State {
        case unknown
        case needed(OnboardingModel)
        case done
    }

    private(set) var state: State = .unknown
    private let uid: String
    private let email: String
    @ObservationIgnored private var cvs: LiveCVs?
    /// Today shows after Finish or Skip.
    @ObservationIgnored var onFinished: (() -> Void)?

    init(uid: String, email: String) {
        self.uid = uid
        self.email = email
    }

    /// The profile document as the store saw it.
    func profileSnapshot(exists: Bool, fromCache: Bool, profile: Profile?) {
        switch state {
        case .done:
            return
        case .needed(let model):
            if let profile {
                model.update(profile: profile)
                if profile.onboardingCompletedAt != nil, model.isCompleted || !model.isFinishing { state = .done }
            }
        case .unknown:
            if let profile {
                state = profile.onboardingCompletedAt == nil ? .needed(makeModel(profile: profile)) : .done
            } else if !exists, !fromCache {
                let model = makeModel(profile: nil)
                model.start()
                state = .needed(model)
            }
        }
    }

    /// The account's saved searches (Finish doesn't add a second one).
    func savedSearchCount(_ count: Int) {
        if case .needed(let model) = state { model.hasSavedSearch = count > 0 }
    }

    private func makeModel(profile: Profile?) -> OnboardingModel {
        let model = OnboardingModel(uid: uid, email: email, profile: profile, progress: OnboardingDefaultsStore())
        model.service = FirestoreOnboardingService(uid: uid)
        let cvs = LiveCVs(uid: uid)
        self.cvs = cvs
        model.importer = cvs.model.importer
        model.cvEditor = cvs.model
        model.onComplete = { [weak self] in
            self?.state = .done
            self?.cvs = nil
            self?.onFinished?()
        }
        return model
    }
}
