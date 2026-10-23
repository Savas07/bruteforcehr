import Foundation

// URL import (`jobImportUrl`, docs/adr/0005-job-sources-scraping.md): the callable returns the job
// document with ISO-8601 timestamps; the client turns it into a `Job` and writes it after the user
// confirms (create when `existingJobId` is nil, else update that job with the merged listing).

public enum JobImportDecodingError: Error, Equatable {
    case notAnObject
    case invalidTimestamp
}

extension JobImportUrlResponse {
    /// Decodes the `data` of a callable result (Foundation JSON objects from the Functions SDK).
    public static func decode(callableData: Any) throws -> JobImportUrlResponse {
        guard JSONSerialization.isValidJSONObject(callableData) else { throw JobImportDecodingError.notAnObject }
        let data = try JSONSerialization.data(withJSONObject: callableData)
        return try BFHRJSON.decoder().decode(JobImportUrlResponse.self, from: data)
    }

    /// The `Job` to write: the existing job's id for a merge, `newID` for a new job.
    public func job(newID: String) throws -> Job {
        try job.job(id: existingJobId ?? newID)
    }
}

extension JobWire {
    /// The domain `Job` with `id`; timestamps parsed like JavaScript (`ISO8601Timestamp`).
    public func job(id: String) throws -> Job {
        let wire = try BFHRJSON.encoder().encode(self)
        guard var object = try JSONSerialization.jsonObject(with: wire) as? [String: Any] else {
            throw JobImportDecodingError.notAnObject
        }
        object["id"] = id
        do {
            return try BFHRJSON.decoder().decode(Job.self, from: JSONSerialization.data(withJSONObject: object))
        } catch is DecodingError {
            throw JobImportDecodingError.invalidTimestamp
        }
    }
}
