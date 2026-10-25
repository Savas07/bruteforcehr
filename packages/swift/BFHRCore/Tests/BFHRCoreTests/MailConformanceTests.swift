import Foundation
import Testing
@testable import BFHRCore

/// `packages/core/conformance/mail.json` (`pnpm --filter @bfhr/core conformance`).
private struct MailVectors: Decodable {
    struct PresetFor: Decodable {
        let address: String
        let preset: String?
    }

    struct CategoryTarget: Decodable {
        let category: MailCategory
        let screening: Bool
        let target: ApplicationStatus?
    }

    let presets: [ImapPreset]
    let endpointPorts: [String: [MailEndpoint.PortSecurity]]
    let presetFor: [PresetFor]
    let categoryTargets: [CategoryTarget]
    let sendLimits: SendLimits

    struct SendLimits: Decodable {
        let maxAttachments: Int
        let maxAttachmentBytes: [String: Int]
        let contentTypes: [String]
    }
}

@Suite("Mail conformance (packages/core/conformance/mail.json)")
struct MailConformanceTests {
    private let vectors: MailVectors

    init() throws {
        vectors = try ConformanceFile.decode(MailVectors.self, from: ConformanceFile.mail)
    }

    @Test func presetsMatchTypeScript() {
        #expect(ImapPreset.all == vectors.presets)
    }

    @Test func presetDetectionMatchesTypeScript() {
        for vector in vectors.presetFor {
            #expect(ImapPreset.preset(for: vector.address)?.id == vector.preset, "\(vector.address)")
        }
    }

    @Test func endpointPortsMatchTypeScript() {
        #expect(vectors.endpointPorts.count == MailEndpointKind.allCases.count)
        for kind in MailEndpointKind.allCases {
            #expect(mailEndpointPorts[kind] == vectors.endpointPorts[kind.rawValue], "\(kind)")
        }
        #expect(MailEndpoint.tls("imap.example.com").isAllowed(as: .imap))
        #expect(!MailEndpoint.tls("imap.example.com", port: 143).isAllowed(as: .imap))
        #expect(MailEndpoint.defaultPort(.smtp, security: .starttls) == 587)
    }

    @Test func sendLimitsMatchTypeScript() {
        #expect(MailSendLimits.maxAttachments == vectors.sendLimits.maxAttachments)
        #expect(MailSendLimits.contentTypes == vectors.sendLimits.contentTypes)
        #expect(vectors.sendLimits.maxAttachmentBytes.count == MailProvider.allCases.count)
        for provider in MailProvider.allCases {
            #expect(MailSendLimits.maxAttachmentBytes(provider) == vectors.sendLimits.maxAttachmentBytes[provider.rawValue], "\(provider)")
        }
    }

    @Test func categoryTargetsMatchTypeScript() {
        #expect(vectors.categoryTargets.count == MailCategory.allCases.count * 2)
        for vector in vectors.categoryTargets {
            #expect(categoryTargetStatus(vector.category, screening: vector.screening) == vector.target, "\(vector.category) \(vector.screening)")
        }
    }

    @Test func reviewMoveFollowsTheTrigger() {
        // Unchanged category: the email's own proposal (a first screen stays screening).
        #expect(reviewMoveTarget(category: .interviewInvite, previousCategory: .interviewInvite, suggestedStatus: .screening, applicationStatus: .applied) == .screening)
        // Corrected category: the category's target.
        #expect(reviewMoveTarget(category: .rejection, previousCategory: .otherJob, suggestedStatus: nil, applicationStatus: .applied) == .rejected)
        // Never backward, never onto the same status, nothing for categories without a target.
        #expect(reviewMoveTarget(category: .applicationReceived, previousCategory: .applicationReceived, suggestedStatus: .acknowledged, applicationStatus: .interviewing) == nil)
        #expect(reviewMoveTarget(category: .assessment, previousCategory: .assessment, suggestedStatus: .screening, applicationStatus: .screening) == nil)
        #expect(reviewMoveTarget(category: .infoRequest, previousCategory: .infoRequest, suggestedStatus: nil, applicationStatus: .applied) == nil)
    }
}
