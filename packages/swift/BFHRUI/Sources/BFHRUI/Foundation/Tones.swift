import BFHRCore
import BFHRDesignTokens
import SwiftUI

// Bridges from BFHRCore's domain enums to BFHRDesignTokens. The token enums use the core raw
// values; FoundationTests keeps both lists equal.

extension ApplicationStatus {
    public var tokenStatus: BFHRStatus {
        switch self {
        case .saved: .saved
        case .preparing: .preparing
        case .applied: .applied
        case .acknowledged: .acknowledged
        case .screening: .screening
        case .interviewing: .interviewing
        case .offer: .offer
        case .accepted: .accepted
        case .declined: .declined
        case .rejected: .rejected
        case .withdrawn: .withdrawn
        case .ghosted: .ghosted
        }
    }

    /// Status tone: saturation rises Applied → Offer, closed outcomes are neutral grey.
    public var tone: BFHRTone { .status(tokenStatus) }
}

extension StatusPhase {
    public var tokenPhase: BFHRPhase {
        switch self {
        case .shortlist: .shortlist
        case .inProgress: .inProgress
        case .closed: .closed
        }
    }

    public var tone: BFHRTone { .phase(tokenPhase) }
}
