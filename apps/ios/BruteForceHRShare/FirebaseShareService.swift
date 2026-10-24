import BFHRCore
import BFHRUI
import FirebaseAuth
import FirebaseFirestore
import FirebaseFunctions
import Foundation

/// `jobImportUrl` + the confirmed writes (ADR 0002 "confirmed URL import", decisions.md D02), as the
/// signed-in user. Firestore rules check every document: jobs never carry `embedding`, events are
/// `actor: user`.
struct FirebaseShareService: JobImportShareService {
    var isSignedIn: Bool { Auth.auth().currentUser != nil }

    func importJob(url: String) async throws -> JobImportUrlResponse {
        do {
            let result = try await Functions.functions(region: "europe-west1").httpsCallable("jobImportUrl").call(["url": url])
            return try JobImportUrlResponse.decode(callableData: result.data)
        } catch let error as NSError where error.domain == FunctionsErrorDomain {
            let details = error.userInfo[FunctionsErrorDetailsKey] as? [String: Any]
            if let reason = (details?["reason"] as? String).flatMap(JobImportErrorReason.init(rawValue:)) {
                throw JobImportShareFailure.reason(reason)
            }
            if FunctionsErrorCode(rawValue: error.code) == .unavailable || FunctionsErrorCode(rawValue: error.code) == .deadlineExceeded {
                throw JobImportShareFailure.offline
            }
            throw JobImportShareFailure.unexpected
        } catch let error as URLError where [.notConnectedToInternet, .networkConnectionLost, .timedOut].contains(error.code) {
            throw JobImportShareFailure.offline
        } catch {
            throw JobImportShareFailure.unexpected
        }
    }

    func save(_ save: JobImportSave) async throws -> Bool {
        guard let uid = Auth.auth().currentUser?.uid else { throw JobImportShareFailure.reason(.emailUnverified) }
        let db = Firestore.firestore()
        let user = db.collection("users").document(uid)
        // The job already has an application (an earlier share or the Tracker): keep it, add none.
        var addsApplication = true
        if let job = save.job, !save.isNewJob {
            let existing = try await user.collection("applications").whereField("jobId", isEqualTo: job.id).limit(to: 1).getDocuments()
            addsApplication = existing.isEmpty
        }
        let batch = db.batch()
        if let job = save.job {
            var data = try Firestore.Encoder().encode(job)
            data["id"] = nil
            if save.isNewJob {
                data["schemaVersion"] = 1
                batch.setData(data, forDocument: user.collection("jobs").document(job.id))
            } else {
                // Field-level update; createdAt and schemaVersion stay as they are (ADR 0002).
                data["createdAt"] = nil
                batch.updateData(data, forDocument: user.collection("jobs").document(job.id))
            }
        }
        if addsApplication {
            var application = try Firestore.Encoder().encode(save.application)
            application["id"] = nil
            application["schemaVersion"] = 1
            batch.setData(application, forDocument: user.collection("applications").document(save.application.id))
            var event = try Firestore.Encoder().encode(save.event)
            event["id"] = nil
            event["schemaVersion"] = 1
            batch.setData(event, forDocument: user.collection("applicationEvents").document(save.event.id))
        }
        // Offline, a commit waits for the server indefinitely; the sheet says "Couldn't save" instead.
        // WriteBatch is thread-safe (Firestore serializes it); it is not touched after commit starts.
        nonisolated(unsafe) let pending = batch
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask { try await pending.commit() }
            group.addTask {
                try await Task.sleep(for: .seconds(20))
                throw URLError(.timedOut)
            }
            try await group.next()
            group.cancelAll()
        }
        return addsApplication
    }
}
