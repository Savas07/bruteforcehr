import Foundation
import Testing
@testable import BFHRUI

@Suite("AppVersion")
struct AppVersionTests {
    @Test("Parses release, short and pre-release versions", arguments: [
        ("0.1.0", "0.1.0"),
        ("1.2.3", "1.2.3"),
        ("10.20.30", "10.20.30"),
        ("1.2", "1.2.0"),
        ("7", "7.0.0"),
        (" 1.0.0\n", "1.0.0"),
        ("1.0.0-beta.1", "1.0.0-beta.1"),
        ("1.0.0-x-y.0", "1.0.0-x-y.0"),
        ("1.0.0+build.5", "1.0.0"),
        ("1.0.0-rc.1+sha.abc", "1.0.0-rc.1"),
    ])
    func parses(input: String, normalized: String) throws {
        let version = try #require(AppVersion(input))
        #expect(version.description == normalized)
    }

    @Test("Rejects what isn't a version", arguments: [
        "", "v1.0.0", "1.0.0.0", "1..0", "1.0.", ".1.0", "01.0.0", "1.02.0", "1.0.0-", "1.0.0-beta..1",
        "1.0.0-01", "1.0.0-beta_1", "-1.0.0", "1.a.0", "１.0.0", "latest",
    ])
    func rejects(input: String) {
        #expect(AppVersion(input) == nil)
    }

    @Test("Orders by SemVer precedence (semver.org §11)")
    func precedence() throws {
        // The example chain from semver.org §11.4, plus numeric (not string) part comparison.
        let ordered = [
            "0.9.9", "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2",
            "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.1", "1.2.0", "1.10.0", "2.0.0",
        ].map { AppVersion($0)! }
        for (lower, higher) in zip(ordered, ordered.dropFirst()) {
            #expect(lower < higher, "\(lower) < \(higher)")
            #expect(!(higher < lower), "\(higher) !< \(lower)")
        }
        #expect(ordered.shuffled().sorted() == ordered)
    }

    @Test("Short forms equal their padded form; build metadata doesn't count")
    func equality() {
        #expect(AppVersion("1.2") == AppVersion("1.2.0"))
        #expect(AppVersion("1.0.0+a") == AppVersion("1.0.0+b"))
        #expect(!(AppVersion("1.0.0")! < AppVersion("1.0.0")!))
        #expect(AppVersion("1.0.0-beta")!.isPrerelease)
        #expect(!AppVersion("1.0.0")!.isPrerelease)
    }
}

@Suite("Update gate")
struct UpdateGateModelTests {
    private func versions(_ latest: String?, _ minimum: String?) -> AppConfigVersions {
        AppConfigVersions(latestVersion: latest, minSupportedVersion: minimum)
    }

    private struct Offline: Error {}

    @Test("Status: required wins, newer shows the banner, everything else is up to date")
    func evaluate() {
        let v = { AppVersion($0)! }
        #expect(UpdateStatus.evaluate(installed: v("0.1.0"), latest: v("0.2.0"), minimum: v("0.1.0"))
            == .available(installed: v("0.1.0"), latest: v("0.2.0")))
        #expect(UpdateStatus.evaluate(installed: v("0.1.0"), latest: v("0.3.0"), minimum: v("0.2.0"))
            == .required(installed: v("0.1.0"), minimum: v("0.2.0")))
        #expect(UpdateStatus.evaluate(installed: v("0.2.0"), latest: v("0.2.0"), minimum: v("0.2.0")) == .upToDate)
        // A development build ahead of the config.
        #expect(UpdateStatus.evaluate(installed: v("0.3.0"), latest: v("0.2.0"), minimum: v("0.1.0")) == .upToDate)
        // The stable build after a beta of the same version is newer.
        #expect(UpdateStatus.evaluate(installed: v("1.0.0-beta.2"), latest: v("1.0.0"), minimum: nil)
            == .available(installed: v("1.0.0-beta.2"), latest: v("1.0.0")))
        // Fail open on anything unknown.
        #expect(UpdateStatus.evaluate(installed: nil, latest: v("9.0.0"), minimum: v("9.0.0")) == .upToDate)
        #expect(UpdateStatus.evaluate(installed: v("0.1.0"), latest: nil, minimum: nil) == .upToDate)
    }

    @Test("Nothing shows before the first read")
    func initialState() {
        let model = UpdateGateModel(installedVersion: "0.1.0", defaults: nil)
        #expect(model.status == .upToDate)
        #expect(model.bannerVersion == nil)
        #expect(!model.isBlocked)
    }

    @Test("A newer latestVersion shows the banner; a minimum above the build blocks")
    func applies() {
        let model = UpdateGateModel(installedVersion: "0.1.0", defaults: nil)
        model.apply(versions("0.2.0", "0.1.0"))
        #expect(model.bannerVersion == AppVersion("0.2.0"))
        #expect(!model.isBlocked)

        model.apply(versions("0.3.0", "0.3.0"))
        #expect(model.bannerVersion == nil)
        #expect(model.isBlocked)
        #expect(model.requirement?.installed == AppVersion("0.1.0"))
        #expect(model.requirement?.minimum == AppVersion("0.3.0"))

        // The minimum went back down (e.g. raised by mistake): unblocked on the next check.
        model.apply(versions("0.3.0", "0.1.0"))
        #expect(!model.isBlocked)
        #expect(model.bannerVersion == AppVersion("0.3.0"))
    }

    @Test("Missing document, missing fields and bad values fail open")
    func failsOpenOnBadConfig() {
        let model = UpdateGateModel(installedVersion: "0.1.0", defaults: nil)
        model.apply(versions(nil, nil))
        #expect(model.status == .upToDate)
        model.apply(versions("not a version", "v9"))
        #expect(model.status == .upToDate)

        let unparseableBuild = UpdateGateModel(installedVersion: "dev", defaults: nil)
        unparseableBuild.apply(versions("9.0.0", "9.0.0"))
        #expect(unparseableBuild.status == .upToDate)
        let noBuild = UpdateGateModel(installedVersion: nil, defaults: nil)
        noBuild.apply(versions("9.0.0", "9.0.0"))
        #expect(!noBuild.isBlocked)
    }

    @Test("A failed read shows no banner and never introduces a block; a confirmed block stays")
    func failedRead() async {
        let model = UpdateGateModel(installedVersion: "0.1.0", defaults: nil)
        await model.check { throw Offline() }
        #expect(model.status == .upToDate)

        await model.check { versions("0.2.0", nil) }
        #expect(model.bannerVersion == AppVersion("0.2.0"))
        await model.check { throw Offline() }
        #expect(model.bannerVersion == nil)

        await model.check { versions("0.3.0", "0.3.0") }
        #expect(model.isBlocked)
        await model.check { throw Offline() }
        #expect(model.isBlocked)
    }

    @Test("Closing the banner hides it for that version and older ones, not for a newer one")
    func dismissal() throws {
        let suite = "bfhr.tests.update.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }

        let model = UpdateGateModel(installedVersion: "0.1.0", defaults: defaults)
        model.apply(versions("0.2.0", nil))
        model.dismissBanner()
        #expect(model.bannerVersion == nil)
        #expect(defaults.string(forKey: UpdateGateModel.dismissedVersionKey) == "0.2.0")

        // Remembered across launches.
        let relaunched = UpdateGateModel(installedVersion: "0.1.0", defaults: defaults)
        relaunched.apply(versions("0.2.0", nil))
        #expect(relaunched.bannerVersion == nil)

        // A newer release brings it back.
        relaunched.apply(versions("0.2.1", nil))
        #expect(relaunched.bannerVersion == AppVersion("0.2.1"))

        // Closing never hides the blocking screen.
        relaunched.apply(versions("0.3.0", "0.3.0"))
        relaunched.dismissBanner()
        #expect(relaunched.isBlocked)
        #expect(defaults.string(forKey: UpdateGateModel.dismissedVersionKey) == "0.2.0")
    }

    @Test("Design states parse from launch arguments")
    func designStates() {
        #expect(DesignUpdateState.parse(arguments: ["app", "-BFHRUpdate", "available"]) == .available)
        #expect(DesignUpdateState.parse(arguments: ["app", "-BFHRUpdate", "required"]) == .required)
        #expect(DesignUpdateState.parse(arguments: ["app", "-BFHRUpdate", "other"]) == nil)
        #expect(DesignUpdateState.parse(arguments: ["app", "-BFHRUpdate"]) == nil)
        #expect(DesignUpdateState.available.model().bannerVersion == AppVersion("0.2.0"))
        #expect(DesignUpdateState.required.model().isBlocked)
    }
}
