#if DEBUG
import Foundation

// Design mode for the update gate (Debug builds only): `-BFHRUpdate available|required` puts the
// gate in that state without reading Firestore, for captures and audits. It combines with the
// screen arguments (`-BFHRScreen today -BFHRUpdate available` shows the banner over Today).
// Release builds compile none of this.

/// The update gate's capture states.
public enum DesignUpdateState: String, CaseIterable, Sendable {
    /// The banner: a newer build is in TestFlight.
    case available
    /// The blocking screen: this build is below the minimum.
    case required

    /// Parses `-BFHRUpdate`; nil when absent or unknown.
    public static func parse(arguments: [String]) -> DesignUpdateState? {
        guard let index = arguments.firstIndex(of: "-BFHRUpdate"), arguments.indices.contains(index + 1) else { return nil }
        return DesignUpdateState(rawValue: arguments[index + 1])
    }

    /// The state this process was launched with, if any.
    public static let launch: DesignUpdateState? = parse(arguments: ProcessInfo.processInfo.arguments)

    /// A gate in this state for an installed 0.1.0, remembering nothing between launches.
    public func model() -> UpdateGateModel {
        let model = UpdateGateModel(installedVersion: "0.1.0", defaults: nil)
        switch self {
        case .available: model.apply(AppConfigVersions(latestVersion: "0.2.0", minSupportedVersion: "0.1.0"))
        case .required: model.apply(AppConfigVersions(latestVersion: "0.3.0", minSupportedVersion: "0.3.0"))
        }
        return model
    }
}
#endif
