#if DEBUG
import BFHRCore
import Foundation

/// Design states of the share sheet (`-BFHRShareSheet <state>` in the app, captures and audits).
/// Debug only: Release builds compile this file empty.
public enum JobImportShareDesignState: String, CaseIterable, Sendable {
    case reading, ready, ai, existing, saved, logged, blocked, offline, signedOut = "signed-out", manual

    public static var launch: JobImportShareDesignState? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-BFHRShareSheet"), index + 1 < arguments.count else { return nil }
        return JobImportShareDesignState(rawValue: arguments[index + 1])
    }

    public func model() -> JobImportShareModel {
        let service = DesignShareService(signedIn: self != .signedOut)
        let sharedText = "https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245"
        let response = Self.response(existing: self == .existing, ai: self == .ai)
        let phase: JobImportShareModel.Phase = switch self {
        case .reading: .reading
        case .ready, .ai, .existing: .ready
        case .saved: .saved(logged: false, addedApplication: true)
        case .logged: .saved(logged: true, addedApplication: true)
        case .blocked: .failed(.reason(.blockedBySite))
        case .offline: .failed(.offline)
        case .signedOut: .signedOut
        case .manual: .manual
        }
        return JobImportShareModel(preview: phase, response: response, sharedText: sharedText, service: service)
    }

    /// A real `jobImportUrl` answer (packages/core/conformance/job-import.json, shortened).
    static func response(existing: Bool, ai: Bool) -> JobImportUrlResponse {
        let json = """
        {"job":{"sources":[{"source":"url_import","sourceId":null,"url":"https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245","applyUrl":"https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245","applyEmail":null,"isDirectFromEmployer":true,"title":"Security Engineer, Cloud","locationText":"New York City, NY, USA","salary":{"min":211400,"max":290600,"currency":"USD","period":"year","estimated":false},"postedAt":"2026-04-07T00:00:00.000Z","firstSeenAt":"2026-10-24T09:00:00.000Z","lastSeenAt":"2026-10-24T09:00:00.000Z"}],"sourceKeys":["url_import:https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245"],"applyUrl":"https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245","applyEmail":null,"company":"Ramp","companyDomain":"ramp.com","title":"Security Engineer, Cloud","locations":[{"label":"New York City, NY, USA","city":"New York","countryCode":"US"}],"remoteType":"remote","remoteEligibility":null,"employmentType":"full_time","seniority":null,"salary":{"min":211400,"max":290600,"currency":"USD","period":"year","estimated":false},"visaSponsorship":null,"relocationSupport":null,"language":"en","description":"About Ramp","skills":["AWS"],"postedAt":"2026-04-07T00:00:00.000Z","expiresAt":null,"fingerprint":"v1|ramp|security engineer cloud|new york","createdAt":"2026-10-24T09:00:00.000Z","updatedAt":"2026-10-24T09:00:00.000Z"},
        "existingJobId":\(existing ? "\"job-ramp\"" : "null"),"method":"\(ai ? "ai" : "json_ld")","site":"ashby","confidence":{"title":0.95},"warnings":[],"model":"none","promptVersion":null,"finalUrl":"https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245","robots":"allowed"}
        """
        // The fixture above is valid by construction; a decoding failure is a programming error.
        // swiftlint:disable:next force_try
        return try! BFHRJSON.decoder().decode(JobImportUrlResponse.self, from: Data(json.utf8))
    }
}

/// Never touches the network: reading waits, saving succeeds.
struct DesignShareService: JobImportShareService {
    let signedIn: Bool
    var isSignedIn: Bool { signedIn }

    func importJob(url: String) async throws -> JobImportUrlResponse {
        JobImportShareDesignState.response(existing: false, ai: false)
    }

    func save(_ save: JobImportSave) async throws -> Bool { true }
}
#endif
