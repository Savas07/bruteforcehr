// swift-tools-version: 6.0
// BFHRCore: Codable models and the status state machine of @bfhr/core, proven against the JSON
// conformance vectors exported by packages/core and packages/fixtures. Foundation only, so it
// builds and tests on Linux too.
import PackageDescription

let package = Package(
    name: "BFHRCore",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "BFHRCore", targets: ["BFHRCore"]),
    ],
    targets: [
        .target(name: "BFHRCore"),
        .testTarget(name: "BFHRCoreTests", dependencies: ["BFHRCore"]),
    ]
)
