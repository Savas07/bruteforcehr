#if DEBUG
import BFHRCore
import BFHRUIFixtures
import Foundation

// Design mode (Debug builds only): fixture-backed screens forced into one state for critique
// captures. Launch arguments (docs/design/foundation-ios.md):
//
//   -BFHRDesign populated|empty            dataset (default populated)
//   -BFHRState loading|error|offline       forced condition (default none)
//   -BFHRScreen today|jobs|job-detail|saved-searches|apply|cv-editor|tracker-board|mail-review|insights|settings|mail-connect
//                                      tab to open at launch (job-detail, saved-searches and apply
//                                      open over the Jobs feed; insights opens the Tracker tab
//                                      with Insights pushed; settings opens the Settings sheet over
//                                      Today, `-BFHRSettingsPage` pushes a page; mail-connect opens
//                                      Connect email over Mail on `-BFHRConnectStep`)
//
// Any one of them turns design mode on. Release builds compile none of this.

/// The five M0 core screens, Insights (M3, pushed on the Tracker), and the Jobs tab's screens
/// (M4: the feed, Saved searches and the Apply sheet).
public enum DesignScreen: String, CaseIterable, Identifiable, Sendable {
    case today
    case jobs
    case jobDetail = "job-detail"
    case savedSearches = "saved-searches"
    case apply
    case cvEditor = "cv-editor"
    case trackerBoard = "tracker-board"
    case mailReview = "mail-review"
    case insights
    /// The Settings sheet over Today (M5).
    case settings
    /// Connect email over the Mail tab (M5).
    case mailConnect = "mail-connect"

    /// Screens shown inside the Jobs stack.
    public var isJobsScreen: Bool { [.jobs, .jobDetail, .savedSearches, .apply].contains(self) }

    public var id: Self { self }
}

/// A condition forced on top of the dataset (states.md defines each).
public enum DesignCondition: String, CaseIterable, Sendable {
    /// Cold load with nothing cached: the skeleton.
    case loading
    /// Cold load failed with nothing cached: the pane error.
    case error
    /// Cached data with the connection banner.
    case offline
}

public struct DesignScenario: Hashable, Sendable {
    public var screen: DesignScreen?
    public var dataset: FixtureDataset
    public var condition: DesignCondition?

    public init(screen: DesignScreen? = nil, dataset: FixtureDataset = .populated, condition: DesignCondition? = nil) {
        self.screen = screen
        self.dataset = dataset
        self.condition = condition
    }

    /// One of the five capture states: populated, empty, loading, error, offline.
    public init?(state: String, screen: DesignScreen? = nil) {
        if let dataset = FixtureDataset(rawValue: state) {
            self.init(screen: screen, dataset: dataset)
        } else if let condition = DesignCondition(rawValue: state) {
            self.init(screen: screen, dataset: .populated, condition: condition)
        } else {
            return nil
        }
    }

    /// The capture state name (file names: `<screen>-<state>-<theme>[-ax].png`).
    public var stateName: String { condition?.rawValue ?? dataset.rawValue }

    /// Every state a core screen must render on demand.
    public static let captureStates = ["populated", "empty", "loading", "error", "offline"]

    /// Parses `-BFHRDesign`, `-BFHRState` and `-BFHRScreen`; nil when none is present. Unknown
    /// values are ignored (the default applies).
    public static func parse(arguments: [String]) -> DesignScenario? {
        func value(_ flag: String) -> String? {
            guard let index = arguments.firstIndex(of: flag), arguments.indices.contains(index + 1) else { return nil }
            return arguments[index + 1]
        }
        let design = value("-BFHRDesign")
        let state = value("-BFHRState")
        let screen = value("-BFHRScreen")
        guard design != nil || state != nil || screen != nil else { return nil }
        return DesignScenario(
            screen: screen.flatMap(DesignScreen.init(rawValue:)),
            dataset: design.flatMap(FixtureDataset.init(rawValue:)) ?? .populated,
            condition: state.flatMap(DesignCondition.init(rawValue:))
        )
    }

    /// The scenario this process was launched with, if any.
    public static let launch: DesignScenario? = parse(arguments: ProcessInfo.processInfo.arguments)

    // MARK: Data

    /// The fixture document. Design mode can't run without it, so a missing file is a
    /// programmer error with the paths that were tried.
    public var document: FixtureDocument {
        do {
            return try FixtureStore.document(dataset)
        } catch {
            fatalError("Design mode: \(error)")
        }
    }

    /// The fixture clock: relative times match the data.
    public var now: Date { document.now }

    public var data: UserData { UserData(document) }

    /// Drives `model` into this scenario's state with the scenario's fixture data.
    public func apply(to model: some ScreenModel) {
        apply(to: model, data: data)
    }

    /// Drives `model` into this scenario's state with `data` (a screen-specific variant of the
    /// fixture, e.g. a job stripped down for the empty state).
    public func apply(to model: some ScreenModel, data: UserData) {
        switch condition {
        case .loading:
            model.phase = .loading
        case .error:
            model.phase = .failed(LoadFailure(.network, details: "Design scenario (-BFHRState error)"))
        case .offline:
            model.load(data)
            model.connection = .offline(lastSyncedAt: now.addingTimeInterval(-18 * 60))
        case nil:
            model.load(data)
        }
    }
}

extension UserData {
    /// The user's part of a fixture document.
    public init(_ document: FixtureDocument) {
        self.init(
            profile: document.profile,
            cvs: document.cvs,
            cvRevisions: document.cvRevisions,
            renderedFiles: document.renderedFiles,
            coverLetters: document.coverLetters,
            jobs: document.jobs,
            jobMatches: document.jobMatches,
            savedSearches: document.savedSearches,
            applications: document.applications,
            applicationEvents: document.applicationEvents,
            interviews: document.interviews,
            contacts: document.contacts,
            mailAccounts: document.mailAccounts,
            mailMessages: document.mailMessages
        )
    }
}
#endif
