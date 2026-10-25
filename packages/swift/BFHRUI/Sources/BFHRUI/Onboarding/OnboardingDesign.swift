#if DEBUG
import BFHRCore
import Foundation
import SwiftUI

// Design mode for onboarding (Debug builds only): `-BFHROnboarding <state>` shows the first-run
// flow in that state without Firebase, for captures and audits. The fake service accepts every
// write at once; "finishing" never returns, so the busy state stays on screen. Release builds
// compile none of this.

/// The onboarding capture states.
public enum DesignOnboardingState: String, CaseIterable, Sendable {
    /// Step 1: the three options.
    case cv
    /// Step 1: the file is being read.
    case cvReading = "cv-reading"
    /// Step 1: read ("Found 3 roles and 14 skills").
    case cvFound = "cv-found"
    /// Step 1: a scanned PDF.
    case cvError = "cv-error"
    /// Step 2 without a CV: empty, with Your name.
    case preferences
    /// Step 2 pre-filled from the CV ("From CV" tags).
    case preferencesCV = "preferences-cv"
    /// Step 2 filled in: Germany + Netherlands (EU / EEA), the United Kingdom, a salary floor.
    case preferencesFilled = "preferences-filled"
    /// Step 3: the first search.
    case finish
    /// Step 3: Start my search was tapped.
    case finishing
    /// Step 3 when a saved search already exists.
    case finishExisting = "finish-existing"
    /// Step 3 after the server refused the write.
    case finishFailed = "finish-failed"
    /// Step 3 with no role and no place (D40): Back to preferences or Go to Today.
    case finishNothing = "finish-nothing"

    /// Parses `-BFHROnboarding`; nil when absent or unknown.
    public static func parse(arguments: [String]) -> DesignOnboardingState? {
        guard let index = arguments.firstIndex(of: "-BFHROnboarding"), arguments.indices.contains(index + 1) else { return nil }
        return DesignOnboardingState(rawValue: arguments[index + 1])
    }

    public static let launch: DesignOnboardingState? = parse(arguments: ProcessInfo.processInfo.arguments)

    /// The fixture clock (foundation-ios.md): 2026-10-22 07:30 UTC.
    static let now = Date(timeIntervalSince1970: 1_792_654_200)
    static let email = "deniz.aksoy@example.com"

    static var content: CvContent {
        var content = CvContent(
            basics: ResumeBasics(name: "Deniz Aksoy", label: "Senior Product Designer", email: email, phone: nil),
            meta: CvMeta(template: "classic", theme: CvTheme(accentColor: "#0F766E", fontPair: "inter", density: .comfortable, paperSize: .a4),
                         sectionOrder: ["basics"], customSections: [])
        )
        content.basics?.location = ResumeLocation(address: nil, postalCode: nil, city: "Berlin", countryCode: "DE", region: nil)
        content.work = [ResumeWork(name: "Lighthouse Learning", position: "Product Designer"), ResumeWork(name: "Kumsal", position: "UX Designer")]
        content.skills = [ResumeSkill(name: "Figma", keywords: ["Prototyping", "Design systems", "User research"])]
        content.languages = [ResumeLanguage(language: "Turkish", fluency: "Native"), ResumeLanguage(language: "English", fluency: "C1"),
                             ResumeLanguage(language: "German", fluency: "B1")]
        return content
    }

    public func model() -> OnboardingModel {
        let service = DesignOnboardingService(hangs: self == .finishing, refuses: self == .finishFailed)
        let model = OnboardingModel(uid: "design", email: Self.email, profile: nil, progress: OnboardingDefaultsStore(defaults: nil),
                                    timezone: "Europe/Berlin", uiLanguage: .en, region: "DE") { Self.now }
        model.service = service
        model.importer = DesignOnboardingImporter()
        model.start()
        switch self {
        case .cv:
            break
        case .cvReading:
            model.cv = .reading(fileName: "Deniz Aksoy – CV 2026.pdf", kind: .pdf)
        case .cvFound:
            model.cvRead(Self.content, cvId: nil, fileName: "Deniz Aksoy – CV 2026.pdf", kind: .pdf)
        case .cvError:
            model.cv = .failed(fileName: "Scan_0042.pdf", error: .unreadable)
        case .preferences:
            model.advance()
        case .finishNothing:
            model.advance()
            model.advance(saving: false)
        case .preferencesCV:
            model.cvRead(Self.content, cvId: nil, fileName: "Deniz Aksoy – CV 2026.pdf", kind: .pdf)
            model.advance()
        case .preferencesFilled, .finish, .finishing, .finishExisting, .finishFailed:
            model.cvRead(Self.content, cvId: nil, fileName: "Deniz Aksoy – CV 2026.pdf", kind: .pdf)
            model.draft.roles = ["Senior Product Designer", "Product Designer"]
            model.draft.seniority = .senior
            model.draft.workplaces = [.remote, .hybrid]
            model.draft.locations = [
                TargetLocation(label: "Germany", city: nil, countryCode: "DE", relocation: true),
                TargetLocation(label: "Netherlands", city: nil, countryCode: "NL", relocation: true),
                TargetLocation(label: "United Kingdom", city: nil, countryCode: "GB", relocation: true),
            ]
            model.draft.openToRelocation = true
            model.draft.salaryAmount = 72_000
            model.draft.setAnswer(.yes, for: "EU")
            model.draft.setAnswer(.no, for: "GB")
            model.advance()
            if self != .preferencesFilled {
                model.hasSavedSearch = self == .finishExisting
                model.advance()
                if self == .finishing || self == .finishFailed {
                    Task { await model.finish(createSearch: true) }
                }
            }
        }
        return model
    }
}

/// Accepts every write at once; `hangs` never returns (the busy state), `refuses` fails.
final class DesignOnboardingService: OnboardingService {
    private let hangs: Bool
    private let refuses: Bool

    init(hangs: Bool, refuses: Bool) {
        self.hangs = hangs
        self.refuses = refuses
    }

    func save(profile: Profile, previous: Profile?, savedSearch: SavedSearch?) async throws {
        guard savedSearch != nil || previous == profile else { return }
        if hangs { try await Task.sleep(for: .seconds(3_600)) }
        if refuses { throw CocoaError(.featureUnsupported) }
    }

    func refreshMatches() async throws {}
}

/// Reads nothing (design mode never uploads).
final class DesignOnboardingImporter: CVImporter {
    func upload(_ data: Data, kind: CVImportFileKind) async throws(CVImportError) -> String { throw .offline }
    func read(storagePath: String, kind: CVImportFileKind) async throws(CVImportError) -> CVImportResult { throw .offline }
}

/// The flow in design mode, in the app's language.
public struct DesignOnboardingScreen: View {
    @State private var model: OnboardingModel

    public init(_ state: DesignOnboardingState) {
        _model = State(initialValue: state.model())
    }

    public var body: some View {
        OnboardingScreen(model: model)
    }
}
#endif
