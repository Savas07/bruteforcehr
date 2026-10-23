import Foundation

/// Copy of the update banner and the update-required screen (table "UpdateGate";
/// docs/design/research/ios-update.md, "Copy notes").
enum UpdateGateStrings {
    static let bannerTitle = LocalizedStringResource.bfhr(
        "update.banner.title", default: "Update available", table: "UpdateGate",
        comment: "Title of the dismissible banner above the tab bar when TestFlight has a newer build."
    )

    static func bannerMessage(_ version: String) -> LocalizedStringResource {
        .bfhr(
            "update.banner.message", default: "Version \(version) is ready in TestFlight.", table: "UpdateGate",
            comment: "Banner sentence. %@ = the new version, e.g. 0.2.0."
        )
    }

    static let openTestFlight = LocalizedStringResource.bfhr(
        "update.action.openTestFlight", default: "Open TestFlight", table: "UpdateGate",
        comment: "Opens Apple's TestFlight app, which installs the update. TestFlight is a product name."
    )

    static let openTestFlightHint = LocalizedStringResource.bfhr(
        "update.action.openTestFlight.hint", default: "Opens TestFlight.", table: "UpdateGate",
        comment: "VoiceOver hint of the one-line banner at accessibility text sizes, whose button reads \"Update available\"."
    )

    static let requiredTitle = LocalizedStringResource.bfhr(
        "update.required.title", default: "Update required", table: "UpdateGate",
        comment: "Title of the blocking screen shown when this build is below the minimum supported version."
    )

    static let requiredMessage = LocalizedStringResource.bfhr(
        "update.required.message",
        default: "This version of BruteForceHR is no longer supported. Install the latest version from TestFlight to continue.",
        table: "UpdateGate",
        comment: "Blocking screen: cause, then the one action."
    )

    static let requiredReassurance = LocalizedStringResource.bfhr(
        "update.required.reassurance", default: "Updating keeps all your data.", table: "UpdateGate",
        comment: "Blocking screen: TestFlight updates keep the app's data on the phone and the account's data in the cloud."
    )

    static func requiredVersions(installed: String, minimum: String) -> LocalizedStringResource {
        .bfhr(
            "update.required.versions", default: "Installed: \(installed) · Required: \(minimum) or later", table: "UpdateGate",
            comment: "Secondary line on the blocking screen. %1$@ = installed version, %2$@ = minimum version."
        )
    }

    static let getHelp = LocalizedStringResource.bfhr(
        "update.action.getHelp", default: "Get help", table: "UpdateGate",
        comment: "Opens the website's Support page."
    )
}
