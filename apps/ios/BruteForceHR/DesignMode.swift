#if DEBUG
import BFHRUI
import SwiftUI

// Design mode (Debug builds only, docs/design/foundation-ios.md): launched with
// `-BFHRDesign populated|empty`, `-BFHRState loading|error|offline` and/or
// `-BFHRScreen <screen>`, every tab shows its fixture-backed core screen in that state.
// Release builds compile none of this file and bundle no fixtures.

extension AppTab {
    /// The tab that hosts a design screen.
    init(designScreen: DesignScreen) {
        switch designScreen {
        case .today, .settings: self = .today
        case .jobs, .jobDetail, .savedSearches, .apply: self = .jobs
        case .cvEditor: self = .cvs
        case .trackerBoard, .insights: self = .tracker
        case .mailReview, .mailConnect: self = .mail
        }
    }

    /// The design screen a tab hosts when another tab was launched.
    var designScreen: DesignScreen {
        switch self {
        case .today: .today
        case .jobs: .jobs
        case .tracker: .trackerBoard
        case .cvs: .cvEditor
        case .mail: .mailReview
        }
    }
}

/// A tab in design mode. The Jobs tab is the real Jobs stack on fixtures (Job detail, Saved
/// searches and Apply open over the feed when launched with them); the other screens are tab
/// roots with a large title.
struct DesignTabRoot: View {
    let tab: AppTab
    let scenario: DesignScenario

    var body: some View {
        if tab == .jobs {
            let screen = scenario.screen.flatMap { $0.isJobsScreen ? $0 : nil } ?? .jobs
            DesignScreenView(screen, scenario: scenario)
        } else {
            // Settings and Connect email are sheets over their tab's screen.
            let screen = scenario.screen.flatMap { [.settings, .mailConnect].contains($0) && AppTab(designScreen: $0) == tab ? $0 : nil }
                ?? tab.designScreen
            NavigationStack {
                DesignScreenView(screen, scenario: scenario)
                    .navigationTitle(tab.title)
                    .navigationBarTitleDisplayMode(.large)
            }
            .modifier(LaunchMark(enabled: tab == .today && LaunchMark.requested))
        }
    }
}

/// `-BFHRPerf YES` (PerformanceTests): when the launch reached each step, in milliseconds since
/// the process started (docs/runbooks/performance.md).
enum LaunchTimeline {
    static let requested = ProcessInfo.processInfo.arguments.contains("-BFHRPerf")
    /// Main-actor only: the app's init and view callbacks.
    nonisolated(unsafe) private(set) static var steps: [(name: String, ms: Int)] = []

    static func mark(_ name: String) {
        guard requested, let started = processStart else { return }
        steps.append((name, Int(Date().timeIntervalSince(started) * 1000)))
    }

    /// When the kernel started this process.
    static let processStart: Date? = {
        var info = kinfo_proc()
        var size = MemoryLayout<kinfo_proc>.stride
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
        guard sysctl(&mib, u_int(mib.count), &info, &size, nil, 0) == 0 else { return nil }
        let start = info.kp_proc.p_un.__p_starttime
        return Date(timeIntervalSince1970: TimeInterval(start.tv_sec) + TimeInterval(start.tv_usec) / 1_000_000)
    }()
}

/// Once Today is on screen and the main thread is free again, shows the launch timeline as a
/// one-point element (`perf.launchToInteractive`) for the test to read, its label
/// `<total ms>;<step>=<ms>;…`: launch to interactive as the app sees it, without the simulator's
/// own launch overhead.
private struct LaunchMark: ViewModifier {
    static let requested = LaunchTimeline.requested

    let enabled: Bool
    @State private var label: String?

    func body(content: Content) -> some View {
        content
            .onAppear {
                guard enabled, label == nil else { return }
                LaunchTimeline.mark("today-appear")
                // The next main-queue turn: the first frame with Today is committed by then.
                DispatchQueue.main.async {
                    LaunchTimeline.mark("interactive")
                    let steps = LaunchTimeline.steps
                    guard let total = steps.last?.ms else { return }
                    label = ([String(total)] + steps.map { "\($0.name)=\($0.ms)" }).joined(separator: ";")
                }
            }
            .overlay(alignment: .topLeading) {
                if let label {
                    Color.clear
                        .frame(width: 1, height: 1)
                        .accessibilityElement()
                        .accessibilityIdentifier("perf.launchToInteractive")
                        .accessibilityLabel(label)
                }
            }
    }
}
#endif
