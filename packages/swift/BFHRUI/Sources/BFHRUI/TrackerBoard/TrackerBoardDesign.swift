#if DEBUG
import BFHRUIFixtures
import Foundation

extension DesignScenario {
    /// The Tracker on the fixture clock, driven into this scenario's state. No selection: the
    /// Pipeline shows every application; the `empty` dataset gives the empty Pipeline (states.md).
    /// `-BFHRTrackerPane` opens one M3 pane over it (`TrackerDesignPane`).
    public func trackerBoardModel() -> TrackerBoardModel {
        let model = TrackerBoardModel(now: now)
        apply(to: model)
        switch TrackerDesignPane.requested {
        case .calendar?, .calendarPast?:
            model.view = .calendar
        case .add?:
            model.route = .add
        case let pane? where pane.opensDetail:
            model.route = .application(dataset == .empty ? "app-missing" : TrackerDesignPane.detailApplication, interviewId: nil)
        default:
            break
        }
        return model
    }
}

/// Design-mode panes for critique captures and UI tests: `-BFHRTrackerPane detail|calendar|
/// calendarPast|add|reminder|interview|contact|notes|explainer|share` opens that pane once per
/// launch, over the populated or empty dataset.
enum TrackerDesignPane: String {
    case detail
    case calendar
    case calendarPast
    case add
    case reminder
    case interview
    case contact
    case notes
    case explainer
    case share

    /// Brightwave: an interview round, a contact, a reminder and an automatic move from an email.
    static let detailApplication = "app-brightwave"

    var opensDetail: Bool {
        switch self {
        case .detail, .reminder, .interview, .contact, .notes, .explainer, .share: true
        case .calendar, .calendarPast, .add: false
        }
    }

    static let requested: TrackerDesignPane? = {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-BFHRTrackerPane"), arguments.indices.contains(index + 1) else { return nil }
        return TrackerDesignPane(rawValue: arguments[index + 1])
    }()

    private static var detailPaneTaken = false

    /// The pane the Application detail opens over itself at launch, once.
    static func takeDetailPane() -> TrackerDesignPane? {
        guard !detailPaneTaken, let requested, requested.opensDetail, requested != .detail else { return nil }
        detailPaneTaken = true
        return requested
    }
}
#endif
