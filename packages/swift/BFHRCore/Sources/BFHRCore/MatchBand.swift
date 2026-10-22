// Port of `matchBand` in packages/core/src/job.ts. Band first, number second: lists show the
// band, detail shows "72 of 100".

public enum MatchBand: String, Codable, Hashable, Sendable, CaseIterable {
    case strong
    case good
    case partial
    case stretch

    /// Provisional lower bounds; recalibrated against real score distributions in M4.
    public static let thresholds: (strong: Int, good: Int, partial: Int) = (80, 65, 45)
}

public func matchBand(_ score: Int) -> MatchBand {
    if score >= MatchBand.thresholds.strong { return .strong }
    if score >= MatchBand.thresholds.good { return .good }
    if score >= MatchBand.thresholds.partial { return .partial }
    return .stretch
}
