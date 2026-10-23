// swift-tools-version: 6.2
// BFHRUI: the SwiftUI layer of the iOS app (shared components + one folder per core screen) and
// its view models. Depends on BFHRCore and BFHRDesignTokens only, never on Firebase, so screens
// build and test in seconds. Contract for screen work: docs/design/foundation-ios.md.
//
// macOS is a build platform only so `swift test` runs the view-model tests on the Mac; the app
// itself is iOS. iOS-only SwiftUI API in a view goes behind `#if os(iOS)` (see the doc).
import PackageDescription

let swiftSettings: [SwiftSetting] = [
    // Same concurrency model as the app target (SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor,
    // SWIFT_APPROACHABLE_CONCURRENCY = YES).
    .defaultIsolation(MainActor.self),
    .enableUpcomingFeature("NonisolatedNonsendingByDefault"),
    .enableUpcomingFeature("InferIsolatedConformances"),
    .enableUpcomingFeature("MemberImportVisibility"),
]

let package = Package(
    name: "BFHRUI",
    defaultLocalization: "en",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "BFHRUI", targets: ["BFHRUI"]),
    ],
    dependencies: [
        .package(path: "../BFHRCore"),
        .package(path: "../../ui-tokens/swift/BFHRDesignTokens"),
    ],
    targets: [
        // Design and test data from packages/fixtures/conformance. Every source file is wrapped in
        // `#if DEBUG`, so Release builds compile this module empty.
        .target(
            name: "BFHRUIFixtures",
            dependencies: ["BFHRCore"],
            swiftSettings: swiftSettings
        ),
        .target(
            name: "BFHRUI",
            dependencies: ["BFHRCore", "BFHRDesignTokens", "BFHRUIFixtures"],
            resources: [
                .process("Resources"),
                // One string table per screen, owned by that screen's folder.
                .process("Today/Today.xcstrings"),
                .process("TrackerCalendar/TrackerCalendar.xcstrings"),
                .process("ApplicationAdd/ApplicationAdd.xcstrings"),
                .process("JobDetail/JobDetail.xcstrings"),
                .process("Jobs/Jobs.xcstrings"),
                .process("Apply/Apply.xcstrings"),
                .process("CVEditor/CVEditor.xcstrings"),
                .process("TrackerBoard/TrackerBoard.xcstrings"),
                .process("MailReview/MailReview.xcstrings"),
                .process("Insights/Insights.xcstrings"),
                .process("UpdateGate/UpdateGate.xcstrings"),
                .process("SignIn/SignIn.xcstrings"),
            ],
            swiftSettings: swiftSettings
        ),
        .testTarget(
            name: "BFHRUITests",
            dependencies: ["BFHRUI", "BFHRUIFixtures", "BFHRCore"],
            swiftSettings: swiftSettings
        ),
    ]
)
